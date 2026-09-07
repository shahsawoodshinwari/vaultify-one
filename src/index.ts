import * as fs from 'fs'
import * as path from 'path'
import * as core from '@actions/core'

const API_BASE = 'https://vaultify.one/api/v1/secrets'

type WriteEncoding = 'utf8' | 'base64'

interface WriteFileMapping {
  title: string
  destination: string
  encoding: WriteEncoding
}

interface VaultifySecret {
  title?: string
  name?: string
  key?: string
  slug?: string
  value?: unknown
  password?: unknown
  secret?: unknown
  content?: unknown
  [key: string]: unknown
}

interface VaultifyResponse {
  data?: VaultifySecret[]
  secrets?: VaultifySecret[]
}

function asSecretList(payload: unknown): VaultifySecret[] {
  if (Array.isArray(payload)) {
    return payload as VaultifySecret[]
  }

  if (payload && typeof payload === 'object') {
    const body = payload as VaultifyResponse
    if (Array.isArray(body.data)) {
      return body.data
    }
    if (Array.isArray(body.secrets)) {
      return body.secrets
    }
  }

  return []
}

function secretTitle(secret: VaultifySecret, index: number): string {
  const raw =
    secret.title || secret.name || secret.key || secret.slug || `SECRET_${index + 1}`
  return String(raw).trim()
}

function secretEnvName(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^([^a-zA-Z_])/, '_$1')
    .toUpperCase()
}

function secretValue(secret: VaultifySecret | string | number): string | null {
  if (typeof secret === 'string' || typeof secret === 'number') {
    return String(secret)
  }

  const value = secret.value ?? secret.password ?? secret.secret ?? secret.content

  if (value == null) {
    return null
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

function parseWriteFiles(raw: string): WriteFileMapping[] {
  const mappings: WriteFileMapping[] = []

  for (const line of String(raw || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const eq = trimmed.indexOf('=')
    if (eq <= 0) {
      throw new Error(
        `Invalid write_files entry "${trimmed}". Expected TITLE=PATH or TITLE=PATH:base64`
      )
    }

    const title = trimmed.slice(0, eq).trim()
    let destination = trimmed.slice(eq + 1).trim()
    let encoding: WriteEncoding = 'utf8'

    if (destination.endsWith(':base64')) {
      encoding = 'base64'
      destination = destination.slice(0, -':base64'.length).trim()
    }

    if (!title || !destination) {
      throw new Error(
        `Invalid write_files entry "${trimmed}". Expected TITLE=PATH or TITLE=PATH:base64`
      )
    }

    mappings.push({ title, destination, encoding })
  }

  return mappings
}

function writeSecretFile(
  destination: string,
  value: string,
  encoding: WriteEncoding
): string {
  const absolute = path.resolve(destination)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })

  if (encoding === 'base64') {
    fs.writeFileSync(absolute, Buffer.from(value.replace(/\s+/g, ''), 'base64'))
  } else {
    fs.writeFileSync(absolute, value, 'utf8')
  }

  return absolute
}

export async function run(): Promise<void> {
  try {
    const apiToken = core.getInput('api_token', { required: true })
    const categoryId = core.getInput('category_id')
    const perPage = core.getInput('per_page') || '100'
    const exportEnv = core.getBooleanInput('export_env')
    const writeFiles = parseWriteFiles(core.getInput('write_files'))

    const apiUrl = new URL(API_BASE)
    if (categoryId) {
      apiUrl.searchParams.set('category_id', categoryId)
    }
    apiUrl.searchParams.set('per_page', perPage)

    core.info(
      categoryId
        ? `Fetching Vaultify secrets for category ${categoryId}`
        : 'Fetching Vaultify secrets'
    )

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `Vaultify API request failed (${response.status}): ${body.slice(0, 300)}`
      )
    }

    const data: unknown = await response.json()
    const secrets = asSecretList(data)
    const byTitle = new Map<string, string>()
    const titles: string[] = []

    for (let i = 0; i < secrets.length; i += 1) {
      const secret = secrets[i]
      const title = secretTitle(secret, i)
      const value = secretValue(secret)

      titles.push(title)

      if (value == null || value === '') {
        core.warning(`Skipping secret without a usable value: ${title}`)
        continue
      }

      core.setSecret(value)
      byTitle.set(title, value)

      if (exportEnv) {
        core.exportVariable(secretEnvName(title), value)
      }
    }

    core.info('Secret titles visible in this category (values hidden):')
    for (const title of titles) {
      core.info(`- ${title}`)
    }

    let written = 0
    for (const mapping of writeFiles) {
      const value = byTitle.get(mapping.title)
      if (value == null) {
        throw new Error(
          `Secret titled "${mapping.title}" was not found in this category`
        )
      }

      const absolute = writeSecretFile(
        mapping.destination,
        value,
        mapping.encoding
      )
      written += 1
      core.info(`Wrote secret "${mapping.title}" to ${absolute}`)
    }

    const secretsJson = JSON.stringify(data)
    core.setSecret(secretsJson)
    core.setOutput('secrets_json', secretsJson)
    core.setOutput('count', String(secrets.length))
    core.setOutput('titles', titles.join(','))

    core.info(
      `Fetched ${secrets.length} secret(s)` +
        (exportEnv ? ', exported environment variables' : '') +
        (written ? `, wrote ${written} file(s)` : '') +
        '.'
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.setFailed(message)
  }
}

if (require.main === module) {
  void run()
}

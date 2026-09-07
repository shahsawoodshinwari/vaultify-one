# Vaultify One GitHub Action

Fetch secrets from [Vaultify One](https://vaultify.one) into your GitHub Actions workflows.

**Author:** Shah Sawood ([@shahsawoodshinwari](https://github.com/shahsawoodshinwari))

## Install / use

```yaml
- name: Fetch secrets from Vaultify
  uses: shahsawoodshinwari/vaultify-one@v1
  with:
    api_token: ${{ secrets.VAULT_ONE_API_KEY }}
    category_id: ${{ vars.VAULT_ONE_CATEGORY }}
    write_files: |
      key.properties=android/key.properties
      release.b64=android/app/upload-keystore.jks:base64
      play-store-service-account.json=android/play-store-service-account.json
```

Pin a commit or tag for reproducibility:

```yaml
uses: shahsawoodshinwari/vaultify-one@v1.0.0
# or
uses: shahsawoodshinwari/vaultify-one@main
```

The API base URL is fixed in the action (`https://vaultify.one/api/v1/secrets`) and cannot be overridden.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `api_token` | yes | — | Vaultify API bearer token |
| `category_id` | no | — | Optional category ID filter |
| `per_page` | no | `100` | Secrets per page |
| `export_env` | no | `false` | Export each secret as a job env var |
| `write_files` | no | — | `TITLE=PATH` or `TITLE=PATH:base64` mappings |

## Outputs

| Output | Description |
| --- | --- |
| `secrets_json` | Full JSON response from Vaultify |
| `count` | Number of secrets returned |
| `titles` | Comma-separated secret titles |

## Example (Flutter / Play signing)

Replaces a manual `curl` + `jq` Vaultify fetch:

```yaml
- name: Fetch signing & Play credentials from Vaultify
  uses: shahsawoodshinwari/vaultify-one@v1
  with:
    api_token: ${{ secrets.VAULT_ONE_API_KEY }}
    category_id: ${{ vars.VAULT_ONE_CATEGORY }}
    write_files: |
      key.properties=android/key.properties
      release.b64=android/app/upload-keystore.jks:base64
      play-store-service-account.json=android/play-store-service-account.json

- name: Build Release AAB
  run: flutter build appbundle --release

- name: Clean up fetched secrets
  if: always()
  run: |
    rm -f android/key.properties android/play-store-service-account.json
    find android/app -name '*.jks' -delete
```

If `key.properties` points `storeFile` at a nested path, either put that full path in `write_files`, or keep a small follow-up step to move/decode the keystore.

## Setup

1. Create an API token in the [Vaultify dashboard](https://vaultify.one).
2. Store it as `VAULT_ONE_API_KEY` under **Settings → Secrets and variables → Actions**.
3. Store the category ID as `VAULT_ONE_CATEGORY` (Actions variable).
4. Use `shahsawoodshinwari/vaultify-one@v1` in your workflow.

## Development

Source lives in TypeScript under `src/`. GitHub runs the compiled bundle in `dist/`.

```bash
npm install
npm run build
npm test          # typecheck
npm run test:local
```

### Test locally

```bash
cp .env.example .env.local
# edit .env.local with your Vaultify token (+ optional category id)
npm run test:local
```

This uses [`@github/local-action`](https://github.com/github/local-action) against `src/index.ts`. `.env.local` is gitignored.

Commit the generated `dist/` folder so GitHub can run the action without installing dependencies at runtime.

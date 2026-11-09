#!/usr/bin/env bash
# Build and deploy to Cloudflare Pages in the **Alhadi** account (never Exprtec).
#
# Auth comes from the `cf` CLI profile "alhadi" (create it with `cf auth create alhadi`).
# `cf pages deploy` does not support classic Pages projects and itself points to
# `wrangler pages deploy`, so we hand the cf OAuth token to wrangler for the upload.
set -euo pipefail

ACCOUNT_ID="bc7bbdb0e3475207e1f89d1d96fcef69" # Alhadi
PROJECT="best-builders-developers"
PROFILE_FILE="${HOME}/Library/Preferences/cloudflare/config/alhadi.json"

cd "$(dirname "$0")/.."

# Refresh the cf token if needed; this also confirms the profile can see the Alhadi account.
cf auth whoami --profile alhadi | grep -q "\"id\": \"${ACCOUNT_ID}\"" \
  || { echo "cf profile 'alhadi' cannot access the Alhadi account. Run: cf auth create alhadi" >&2; exit 1; }

TOKEN="$(node -e 'process.stdout.write(require(process.argv[1]).oauth_token)' "$PROFILE_FILE")"

pnpm build

CLOUDFLARE_API_TOKEN="$TOKEN" CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" \
  pnpm exec wrangler pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true

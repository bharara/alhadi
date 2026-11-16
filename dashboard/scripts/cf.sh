#!/usr/bin/env bash
# Runs a command with Cloudflare credentials for the **Alhadi** account (never Exprtec).
# Auth comes from the `cf` CLI profile "alhadi" (create it with `cf auth create alhadi`).
# Usage: bash scripts/cf.sh wrangler d1 migrations apply DB --remote
set -euo pipefail

ACCOUNT_ID="bc7bbdb0e3475207e1f89d1d96fcef69" # Alhadi
PROFILE_FILE="${HOME}/Library/Preferences/cloudflare/config/alhadi.json"

cf auth whoami --profile alhadi | grep -q "\"id\": \"${ACCOUNT_ID}\"" \
  || { echo "cf profile 'alhadi' cannot access the Alhadi account. Run: cf auth create alhadi" >&2; exit 1; }

TOKEN="$(node -e 'process.stdout.write(require(process.argv[1]).oauth_token)' "$PROFILE_FILE")"

cd "$(dirname "$0")/.."
if [ "$1" = "wrangler" ]; then shift; set -- pnpm exec wrangler "$@"; fi
CLOUDFLARE_API_TOKEN="$TOKEN" CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" "$@"

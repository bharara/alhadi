#!/usr/bin/env bash
# Build the dashboard SPA and deploy the Worker to the **Alhadi** Cloudflare account.
set -euo pipefail
cd "$(dirname "$0")/.."

if grep -q '"database_id": "00000000-0000-0000-0000-000000000000"' wrangler.jsonc; then
  echo "Set the D1 database_id in wrangler.jsonc first (README, go-live step 2)." >&2
  exit 1
fi

pnpm typecheck
pnpm build
bash scripts/cf.sh wrangler d1 migrations apply DB --remote
bash scripts/cf.sh wrangler deploy

# Agents

## Cloudflare

Use the `cf` CLI for Cloudflare reads (logs, D1); keep `wrangler` for deploys and migrations. Set `CLOUDFLARE_ACCOUNT_ID=bc7bbdb0e3475207e1f89d1d96fcef69` (Alhadi) on every `cf` call: with several accounts logged in, `cf` can silently answer from another one, so check `run.accountId` before trusting an empty result.

## CRM errors

The CRM is the `bbd-dashboard` Worker. Query its errors with `cf observability telemetry query`, filtering `$metadata.service` to `bbd-dashboard` and `$metadata.level` to `error`. SPA crashes happen in the browser and never reach these logs.

A missing-column D1 error during a deploy is usually transient: Workers Builds runs `pnpm run deploy` on push to `main`, which migrates before the new Worker goes live. Compare against `applied_at` in `d1_migrations`.

# Agents

## Cloudflare

Use the `cf` CLI for Cloudflare reads (logs, D1, accounts). The `wrangler` login here lacks observability and analytics scopes, so keep `wrangler` for deploys and migrations.

Every `cf` call runs on the **Alhadi** account with the `alhadi` profile:

```sh
export CLOUDFLARE_ACCOUNT_ID=bc7bbdb0e3475207e1f89d1d96fcef69
cf <command> --profile alhadi
```

Both are needed. Without them `cf` silently answers from the Exprtec account, and an empty result there looks like "no errors". Confirm `run.accountId` in the response is the Alhadi id.

## CRM errors

The CRM is the `bbd-dashboard` Worker. Query its errors with `cf observability telemetry query`, filtering `$metadata.service` to `bbd-dashboard` and `$metadata.level` to `error`. SPA crashes happen in the browser and never reach these logs.

A missing-column D1 error right after a deploy is usually transient: `pnpm deploy` migrates before the new Worker goes live. Compare against `applied_at` in `d1_migrations`.

# Best Builders dashboard

The CRM (ported from propCRM), website listings and Search Console analytics for bestbuilderdeveloper.com.
It runs as one Cloudflare Worker with D1, serving a React SPA. Everything lives in the **Alhadi** Cloudflare account.
`account_id` is pinned in `wrangler.jsonc`, and every remote command goes through `scripts/cf.sh`, which refuses to run unless the `alhadi` cf profile can see that account.

| Path | What |
|---|---|
| `worker/` | Hono API. One folder per feature (`prospects/`, `inventory/`, `website/`, `analytics/`, `users/`, `auth/`, `report/`) |
| `src/` | React 19 + Vite + Tailwind SPA. It talks to the Worker through the typed Hono client (`src/lib/api.ts`) |
| `migrations/` | D1 schema (plain SQL, applied with `wrangler d1 migrations apply`) |
| `scripts/` | `cf.sh` (Alhadi credentials), `deploy.sh`, `create-admin.mjs` |

## How the website gets its listings

1. Every property in **Properties** has a Website card. It sets the project page the property belongs to, whether it is shown, whether it is featured on the home page, whether the price and plot number are shown, a public title and details, and the display order.
2. **Website listings** holds the section settings (headings, intro, how many on home, show sold) and quick toggles.
3. `GET /api/public/listings` returns only those public fields. Owner contacts and internal notes never leave the Worker. Responses are cached at the edge for 60 seconds, and edits clear the cache.
4. The landing site's `Listings.astro` fetches that endpoint in the browser and shows the cards. If nothing is published, the section stays hidden.

## Local development

```sh
pnpm install
cp .dev.vars.example .dev.vars        # then put long random values in it
pnpm db:migrate:local
node scripts/create-admin.mjs admin   # asks for a password
pnpm dev                              # builds the SPA, then wrangler dev on :8787 (local D1)
```

For SPA hot reload, run `pnpm dev:vite` (port 5173) alongside `wrangler dev`; it proxies `/api` to the Worker on :8787.
To point the landing site at the local Worker, run `PUBLIC_LISTINGS_API=http://localhost:8787 pnpm dev` in `landing/`.

`pnpm check` runs the typecheck and the production build.

## Go live (one time)

Prerequisite: `cf auth whoami --profile alhadi` lists the Alhadi account (`bc7bbdb0e3475207e1f89d1d96fcef69`).

1. **Create the database** in the Alhadi account:
   ```sh
   cd dashboard && pnpm install
   bash scripts/cf.sh wrangler d1 create bbd
   ```
   Copy the printed `database_id` into `wrangler.jsonc`, replacing the zeros, and commit it.
2. **Deploy.** This applies the migrations to the remote D1, then deploys the Worker and its custom domain `dashboard.bestbuilderdeveloper.com`:
   ```sh
   pnpm run deploy
   ```
3. **Set the secrets.** Generate each value with `openssl rand -hex 32`. Keep `PASSWORD_PEPPER` in your password manager: changing it invalidates every password.
   ```sh
   bash scripts/cf.sh wrangler secret put SESSION_SECRET
   bash scripts/cf.sh wrangler secret put PASSWORD_PEPPER
   ```
4. **Create your admin account:**
   ```sh
   PASSWORD_PEPPER=<the value from step 3> node scripts/create-admin.mjs you@example.com --remote
   ```
   Sign in at https://dashboard.bestbuilderdeveloper.com. Invite the team from **User management**. Invites are links you copy or share on WhatsApp; no email is sent.
5. **Search Console:**
   1. In Google Cloud (any project): enable the *Google Search Console API*, create a service account, and download a JSON key.
   2. In Search Console, open the `bestbuilderdeveloper.com` property. Go to Settings → Users and permissions → Add user, enter the service account's email, and choose *Restricted*.
   3. The Worker expects the domain property `sc-domain:bestbuilderdeveloper.com`. If yours is a URL-prefix property, set `GSC_PROPERTY` in `wrangler.jsonc` to `https://bestbuilderdeveloper.com/` and redeploy.
   4. Store the key: `bash scripts/cf.sh wrangler secret put GSC_SERVICE_ACCOUNT_JSON < key.json`, then delete the local key file.
   5. In the dashboard, open **Search analytics** and click **Backfill 16 months**. A cron then re-syncs the last 5 days every day at 02:30 UTC.
6. **Publish some properties** (Properties → Website card → Show on website), then redeploy the landing site so it includes the listings section: `cd ../landing && pnpm run deploy`.

After this, `pnpm run deploy` in `dashboard/` ships every change: it runs typecheck, build, remote migrations and deploy.

## Free plan notes

- **Workers Free:** 100k requests/day, shared with Pages Functions; static assets don't count. Each request gets 10 ms of CPU. Password hashing is PBKDF2-SHA256 at 10k iterations over an HMAC with the secret pepper, which keeps a login inside that budget. A copy of D1 alone can't be cracked without the pepper.
- **D1 Free:** 5M rows read/day, 100k rows written/day, 5 GB storage.
  - Prospect lists read the latest touch from the prospect row (`last_touched_at` and friends), not by scanning touches.
  - A filtered search over all prospects still reads every prospect row, because SQLite `LIKE` can't use an index. With tens of thousands of prospects and heavy daily searching, the $5 Workers Paid plan (25B reads/month) removes that concern.
- **Cron triggers:** the free plan allows 5 per account; this Worker uses one.

## Importing propCRM data (later)

The schema keeps propCRM's ids and columns, so the data can be imported as-is. The differences:

- **Timestamps** become ISO 8601 UTC text.
- **`tags` and `extra`** become JSON text.
- **Inventory items** get the website columns with their defaults.
- **Prospects** get `last_touched_at`, `last_touch_kind` and `last_touch_summary`, filled from each prospect's latest touch.
- **Password hashes:** propCRM's bcrypt hashes can't be verified here (bcrypt doesn't fit the 10 ms CPU budget). After the import, give each user a new password from User management, or have them accept a fresh invite.

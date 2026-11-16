# Best Builders dashboard

The CRM (ported from propCRM), website listings and Search Console analytics for bestbuilderdeveloper.com.
It runs as one Cloudflare Worker with D1, serving a React SPA. Everything lives in the **Alhadi** Cloudflare account (`account_id` is pinned in `wrangler.jsonc`).

| Path | What |
|---|---|
| `worker/` | Hono API. One folder per feature (`prospects/`, `inventory/`, `website/`, `analytics/`, `users/`, `auth/`, `report/`) |
| `src/` | React 19 + Vite + Tailwind SPA. It talks to the Worker through the typed Hono client (`src/lib/api.ts`) |
| `migrations/` | D1 schema (plain SQL, applied with `wrangler d1 migrations apply`) |

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
pnpm dev                              # builds the SPA, then wrangler dev on :8787 (local D1)
```

Create a local user by inserting a row into `users` with `wrangler d1 execute DB --local`.
The hash format is in `worker/auth/password.ts` and must be computed with the same `PASSWORD_PEPPER` as `.dev.vars`.

For SPA hot reload, run `pnpm dev:vite` (port 5173) alongside `wrangler dev`; it proxies `/api` to the Worker.
To point the landing site at the local Worker, run `PUBLIC_LISTINGS_API=http://localhost:8787 pnpm dev` in `landing/`.

`pnpm check` runs the typecheck and the production build.

## Deployment

Both apps build from GitHub (`bharara/alhadi`) in the Alhadi Cloudflare account. Pushing deploys them.

| App | Cloudflare project | Root | Deploys from |
|---|---|---|---|
| Dashboard | Worker `bbd-dashboard`, Workers Builds | `dashboard/` | the branch in its build trigger (currently `feat/crm`) |
| Landing | Pages `best-builders-developers` | `landing/` | `main`; other branches get preview URLs |

The dashboard's deploy command is `pnpm run deploy`, which applies D1 migrations and then runs `wrangler deploy`.

**Resources:**
- D1 database `bbd`.
- Custom domain `crm.bestbuilderdeveloper.com`.
- Cron `30 2 * * *`, which syncs the last 5 days of Search Console data.

**Worker secrets:**

| Secret | What it is |
|---|---|
| `SESSION_SECRET` | Signs session cookies |
| `PASSWORD_PEPPER` | Mixed into every password hash. Changing it invalidates all passwords |
| `GSC_SERVICE_ACCOUNT_JSON` | Google service-account key. The account must be a user on `sc-domain:bestbuilderdeveloper.com` |

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

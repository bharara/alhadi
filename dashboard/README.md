# Best Builders dashboard

The CRM (ported from propCRM), website listings and Search Console analytics for bestbuilderdeveloper.com.
It runs as one Cloudflare Worker with D1, serving a React SPA. Everything lives in the **Alhadi** Cloudflare account (`account_id` is pinned in `wrangler.jsonc`).

| Path | What |
|---|---|
| `worker/` | Hono API. One folder per feature (`prospects/`, `inventory/`, `website/`, `analytics/`, `users/`, `auth/`, `report/`) |
| `src/` | React 19 + Vite + Tailwind SPA. It talks to the Worker through the typed Hono client (`src/lib/api.ts`) |
| `migrations/` | D1 schema (plain SQL, applied with `wrangler d1 migrations apply`) |

## Internal inventory and the website directory

**Inventory** (`inventory_items`) holds every property. It is internal: owner contacts, asking price, notes. Only signed-in staff see it.

**Website listings** (`website_listings`, `listing_photos`) are the curated public directory. A listing points at one inventory item and holds only what the public sees:
- web address (slug), title, card text, description, price text (shown as written; empty shows "Call for price")
- features, photos, project page, featured on home, published, display order

When the inventory item is marked sold, its listing hides from the site, or shows as sold if the "show sold" setting is on.

**Photos:**
- They are resized in the browser to WebP: 1600px for the full image, 600px for the thumbnail.
- They are stored in R2 bucket `bbd-media`, served from `https://media.bestbuilderdeveloper.com`.
- The first photo is the cover and the share image.

**Two ways the site shows listings:**
- **Live cards** (home "Available now", project pages) read `GET /api/public/listings`. It is cached for 60 seconds, and edits clear the cache.
- **Static pages** (`/properties/` and `/properties/<slug>/`) are built by the landing site from `GET /api/public/listings/full`.
  - A change to a published listing marks the site for rebuild.
  - A 5-minute cron starts one Pages build once edits have settled for 2 minutes. Admins can also click "Rebuild site now" under Website listings.
  - The build uses `PAGES_API_TOKEN` and builds `LANDING_BRANCH`.

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
- R2 bucket `bbd-media`, public at `media.bestbuilderdeveloper.com`. Lifecycle rules live in `r2-lifecycle.json`; apply them with `wrangler r2 bucket lifecycle set bbd-media --file r2-lifecycle.json`.
  - Incomplete multipart uploads are aborted after 1 day.
  - Anything under `tmp/` expires after 1 day.
  - Photos under `listings/` never expire. They are deleted with their photo, listing or property, and Standard storage is kept because every page view reads them.
- Custom domain `crm.bestbuilderdeveloper.com`.
- Crons: `30 2 * * *` syncs the last 5 days of Search Console data; `*/5 * * * *` starts a pending landing rebuild.
- When this branch merges, set `LANDING_BRANCH` to `main` and point the Workers Builds trigger at `main`.

**Worker secrets:**

| Secret | What it is |
|---|---|
| `SESSION_SECRET` | Signs session cookies |
| `PASSWORD_PEPPER` | Mixed into every password hash. Changing it invalidates all passwords |
| `PAGES_API_TOKEN` | Cloudflare token with Pages edit access. Starts landing builds when listings change |
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

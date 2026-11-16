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

**How the site shows listings:** everything is static. The landing build reads `GET /api/public/listings/full` and renders:
- the home "Available now" section and each project page's listings
- `/properties/` and `/properties/<slug>/`

A change to a published listing (or to a field it shows, or the website settings) marks the site for rebuild. A 5-minute cron starts one Pages build once edits have settled for 2 minutes, so changes appear within a few minutes. Admins can also click "Rebuild site now" under Website listings. The build uses `PAGES_API_TOKEN` and builds `LANDING_BRANCH`.

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
| Dashboard | Worker `bbd-dashboard`, Workers Builds | `dashboard/` | `main` |
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

## Data from propCRM

propCRM's production data was imported on 16 Nov 2026: 7 users, 4,548 prospects, 1,532 touches and 56 properties. Ids were kept, timestamps converted to ISO UTC, and each prospect's latest touch was filled in.
- The 2 users who were inactive in propCRM came over deactivated, so their history keeps their names.
- Imported users have no usable password. They sign in through a set-password link. An admin can issue a new one from User management → Password link, valid 7 days and usable once.

## Signing in

Users sign in with their email and password. To give someone access:
- **New person:** User management → Invite user.
- **Existing user who needs a password:** User management → Password link.

Either way, share the link on WhatsApp or copy it; no email is sent.

# Best Builders dashboard

The CRM (ported from propCRM), website listings and Search Console analytics for bestbuilderdeveloper.com.
It runs as one Cloudflare Worker with D1, serving a React SPA. Everything lives in the **Alhadi** Cloudflare account (`account_id` is pinned in `wrangler.jsonc`).

| Path | What |
|---|---|
| `worker/` | Hono API. One folder per feature (`prospects/`, `inventory/`, `website/`, `analytics/`, `users/`, `auth/`, `report/`) |
| `src/` | React 19 + Vite + Tailwind SPA. It talks to the Worker through the typed Hono client (`src/lib/api.ts`) |
| `migrations/` | D1 schema (plain SQL, applied with `wrangler d1 migrations apply`) |

## Properties and the website

Every property is one row in `inventory_items`, opened in the dashboard as one page with two tabs.
- **Details** is internal: owner contact, asking price, notes, who entered it. Only signed-in staff see it.
- **Website** is what the public sees: project page, web address, title, card text, description, price text (shown as written; empty shows "Call for price"), features, photos (`property_photos`), published, featured on home, and display order.

The public feed (`worker/website/public.ts`) selects only the website columns, so owner details never leave the Worker. A sold property drops off the site, or stays marked Sold if the "show sold" setting is on.

**Photos:**
- They are resized in the browser to WebP: 1600px for the full image, 600px for the thumbnail.
- They are stored in R2 bucket `bbd-media`, served from `https://media.bestbuilderdeveloper.com`.
- The first photo is the cover and the share image.

**How the site shows listings:** everything is static. The landing build reads `GET /api/public/listings/full` and renders:
- the home "Available now" section and each project page's listings
- `/properties/` and `/properties/<slug>/`

A change to a published property (or to a field it shows, or the website settings) marks the site for rebuild. A 5-minute cron starts one Pages build once edits have settled for 2 minutes, so changes appear within a few minutes. Admins can also click "Rebuild site now" on the Website page. The build uses `PAGES_API_TOKEN` and builds `LANDING_BRANCH`.

## Site analytics

The landing site sends an event for each pageview and each enquiry (WhatsApp tap, phone tap, lead form) to `bestbuilderdeveloper.com/a/e`. That path is routed to this Worker so it stays first-party.

**Each event records:**
- Pakistan day, path and property
- channel (direct, organic search, paid, social, WhatsApp, AI assistants, email, other websites), source and UTM campaign, all taken from how the visit started
- country, device and browser

**Privacy:** no cookies and no IP addresses. Visitors are a hash that rotates daily, and a visit is a `sessionStorage` id. Bots and requests from other sites are dropped.

**Storage:** events live in `web_events`, and anything older than 400 days is deleted nightly. Dashboard → Site analytics shows totals against the previous period, a daily chart, sources, top pages, properties, countries and devices.

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

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Cache } from "@cloudflare/workers-types";
import { all, parseJson } from "../db";
import type { Env, WorkerEnv } from "../env";
import { INVENTORY_TYPE_LABELS, WEBSITE_PROJECTS, type InventoryType } from "../inventory/fields";
import { readWebsiteSettings } from "./settings";

const PATHS = ["/api/public/listings", "/api/public/listings/full"];
const CACHE_SECONDS = 60;

type PublicRow = {
  id: string;
  slug: string;
  project_slug: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  price_text: string | null;
  show_number: number;
  features: string;
  featured: number;
  sort_order: number;
  published_at: string | null;
  updated_at: string | null;
  created_at: string;
  type: InventoryType;
  status: "available" | "sold";
  size: string;
  block: string | null;
  house_number: string;
};
type PhotoRow = { listing_id: string; storage_key: string; width: number; height: number; alt: string | null };

const edgeCache = () => (globalThis as unknown as { caches: { default: Cache } }).caches.default;

/** Drops the cached public responses so dashboard edits show on the site right away (in this location). */
export async function purgePublicListings(requestUrl: string): Promise<void> {
  await Promise.all(PATHS.map((path) => edgeCache().delete(new URL(path, requestUrl).toString())));
}

/**
 * Only what a listing chose to show leaves the Worker: no owner contacts, internal notes or asking price.
 * Sold properties stay listed (marked sold) only when the site settings say so.
 */
async function publishedListings(env: Env) {
  const settings = await readWebsiteSettings(env.DB);
  const rows = await all<PublicRow>(
    env.DB,
    `SELECT l.id, l.slug, l.project_slug, l.title, l.summary, l.description, l.price_text, l.show_number, l.features, l.featured, l.sort_order,
            l.published_at, l.updated_at, l.created_at, i.type, i.status, i.size, i.block, i.house_number
     FROM website_listings l JOIN inventory_items i ON i.id = l.inventory_item_id
     WHERE l.published = 1 ${settings.show_sold ? "" : "AND i.status = 'available'"}
     ORDER BY l.sort_order, COALESCE(l.published_at, l.created_at) DESC
     LIMIT 500`,
  );
  const photos = await all<PhotoRow>(
    env.DB,
    `SELECT p.listing_id, p.storage_key, p.width, p.height, p.alt FROM listing_photos p
     JOIN website_listings l ON l.id = p.listing_id WHERE l.published = 1 ORDER BY p.listing_id, p.sort_order, p.created_at`,
  );
  const photosByListing = new Map<string, PhotoRow[]>();
  for (const photo of photos) photosByListing.set(photo.listing_id, [...(photosByListing.get(photo.listing_id) ?? []), photo]);
  const projectName = new Map<string, string>(WEBSITE_PROJECTS.map((p) => [p.slug, p.name]));
  const site = env.PUBLIC_SITE_URL.replace(/\/$/, "");

  const listings = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    url: `${site}/properties/${row.slug}/`,
    project_slug: row.project_slug,
    project_name: row.project_slug ? (projectName.get(row.project_slug) ?? null) : null,
    title: row.title,
    summary: row.summary,
    description: row.description,
    type: row.type,
    type_label: INVENTORY_TYPE_LABELS[row.type],
    size: row.size,
    block: row.block,
    number: row.show_number ? row.house_number : null,
    price: row.price_text,
    features: parseJson<string[]>(row.features, []),
    status: row.status,
    featured: Boolean(row.featured),
    published_at: row.published_at,
    updated_at: row.updated_at ?? row.created_at,
    photos: (photosByListing.get(row.id) ?? []).map((p) => ({
      full: `${env.MEDIA_URL}/${p.storage_key}-1600.webp`,
      thumb: `${env.MEDIA_URL}/${p.storage_key}-600.webp`,
      width: p.width,
      height: p.height,
      alt: p.alt,
    })),
  }));
  return {
    settings: {
      home: { enabled: settings.home_enabled, heading: settings.home_heading, intro: settings.home_intro, limit: settings.home_limit },
      project: { enabled: settings.project_enabled, heading: settings.project_heading },
    },
    projects: WEBSITE_PROJECTS,
    listings,
  };
}

/** Card data for the live "Available now" sections. */
async function listingCards(env: Env) {
  const { settings, listings } = await publishedListings(env);
  return {
    settings,
    items: listings.map(({ description: _d, photos, summary, ...card }) => ({ ...card, details: summary, cover: photos[0] ?? null })),
  };
}

async function cached(c: { req: { url: string }; executionCtx: { waitUntil(p: Promise<unknown>): void } }, path: string, build: () => Promise<unknown>) {
  const cache = edgeCache();
  const key = new URL(path, c.req.url).toString();
  const hit = await cache.match(key);
  if (hit) return new Response(hit.body as BodyInit, hit as unknown as ResponseInit);
  const response = Response.json(await build(), { headers: { "Cache-Control": `public, max-age=${CACHE_SECONDS}` } });
  c.executionCtx.waitUntil(cache.put(key, response.clone() as never));
  return response;
}

export const publicRoutes = new Hono<WorkerEnv>()
  .use(
    "*",
    cors({
      origin: (origin, c) => {
        const site = new URL(c.env.PUBLIC_SITE_URL).hostname;
        try {
          const host = new URL(origin).hostname;
          const allowed = host === site || host === `www.${site}` || host.endsWith(".best-builders-developers.pages.dev") || host === "localhost";
          return allowed ? origin : null;
        } catch {
          return null;
        }
      },
      allowMethods: ["GET"],
    }),
  )
  .get("/listings", (c) => cached(c, PATHS[0]!, () => listingCards(c.env)))
  // Everything the static listing pages need; read by the landing build.
  .get("/listings/full", (c) => cached(c, PATHS[1]!, () => publishedListings(c.env)));

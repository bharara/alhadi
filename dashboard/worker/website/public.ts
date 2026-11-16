import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Cache } from "@cloudflare/workers-types";
import { all } from "../db";
import type { Env, WorkerEnv } from "../env";
import { INVENTORY_TYPE_LABELS, WEBSITE_PROJECTS, type InventoryType } from "../inventory/fields";
import { readWebsiteSettings } from "./settings";

const PATH = "/api/public/listings";
const CACHE_SECONDS = 60;

type PublicRow = {
  id: string;
  type: InventoryType;
  status: "available" | "sold";
  size: string;
  block: string | null;
  house_number: string;
  asking_price: string | null;
  project_slug: string | null;
  featured: number;
  show_price: number;
  show_number: number;
  public_title: string | null;
  public_details: string | null;
};

const edgeCache = () => (globalThis as unknown as { caches: { default: Cache } }).caches.default;

/** Drops the cached public response so dashboard edits show on the site right away (in this location). */
export async function purgePublicListings(requestUrl: string): Promise<void> {
  await edgeCache().delete(new URL(PATH, requestUrl).toString());
}

/** Only fields chosen for the site leave the Worker: no owner contacts, no internal notes. */
async function listings(env: Env) {
  const settings = await readWebsiteSettings(env.DB);
  const rows = await all<PublicRow>(
    env.DB,
    `SELECT id, type, status, size, block, house_number, asking_price, project_slug, featured, show_price, show_number, public_title, public_details
     FROM inventory_items
     WHERE published = 1 ${settings.show_sold ? "" : "AND status = 'available'"}
     ORDER BY website_order, COALESCE(updated_at, created_at) DESC
     LIMIT 200`,
  );
  const projectName = new Map<string, string>(WEBSITE_PROJECTS.map((p) => [p.slug, p.name]));
  return {
    settings: {
      home: { enabled: settings.home_enabled, heading: settings.home_heading, intro: settings.home_intro, limit: settings.home_limit },
      project: { enabled: settings.project_enabled, heading: settings.project_heading },
    },
    items: rows.map((row) => ({
      id: row.id,
      project_slug: row.project_slug,
      project_name: row.project_slug ? (projectName.get(row.project_slug) ?? null) : null,
      title: row.public_title || `${row.size} ${INVENTORY_TYPE_LABELS[row.type].toLowerCase()}`,
      type: row.type,
      type_label: INVENTORY_TYPE_LABELS[row.type],
      size: row.size,
      block: row.block,
      number: row.show_number ? row.house_number : null,
      price: row.show_price ? row.asking_price : null,
      details: row.public_details,
      status: row.status,
      featured: Boolean(row.featured),
    })),
  };
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
  .get("/listings", async (c) => {
    const cache = edgeCache();
    const key = new URL(PATH, c.req.url).toString();
    const hit = await cache.match(key);
    if (hit) return new Response(hit.body as BodyInit, hit as unknown as ResponseInit);
    const response = c.json(await listings(c.env), 200, { "Cache-Control": `public, max-age=${CACHE_SECONDS}` });
    c.executionCtx.waitUntil(cache.put(key, response.clone() as never));
    return response;
  });

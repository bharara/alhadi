import { Hono } from "hono";
import { all, parseJson } from "../db";
import type { Env, WorkerEnv } from "../env";
import { autoTitle, INVENTORY_TYPE_LABELS, type InventoryType } from "../inventory/fields";
import { WEBSITE_PROJECTS } from "./fields";
import { photoUrls } from "./photos";
import { readWebsiteSettings } from "./settings";

type PublicRow = {
  id: string;
  slug: string;
  project_slug: string | null;
  web_title: string | null;
  web_summary: string | null;
  web_description: string | null;
  web_price: string | null;
  show_number: number;
  web_features: string;
  featured: number;
  published_at: string | null;
  updated_at: string | null;
  created_at: string;
  type: InventoryType;
  status: "available" | "sold";
  size: string;
  block: string | null;
  house_number: string;
};
type PhotoRow = { property_id: string; storage_key: string; width: number; height: number; alt: string | null };

// Only what a listing chose to show leaves the Worker: no owner contacts, notes or internal asking price.
async function publishedListings(env: Env) {
  const settings = await readWebsiteSettings(env.DB);
  const rows = await all<PublicRow>(
    env.DB,
    `SELECT id, slug, project_slug, web_title, web_summary, web_description, web_price, show_number, web_features, featured,
            published_at, updated_at, created_at, type, status, size, block, house_number
     FROM inventory_items
     WHERE published = 1 AND slug IS NOT NULL ${settings.show_sold ? "" : "AND status = 'available'"}
     ORDER BY web_order, COALESCE(published_at, created_at) DESC, id
     LIMIT 500`,
  );
  const photos = await all<PhotoRow>(
    env.DB,
    `SELECT p.property_id, p.storage_key, p.width, p.height, p.alt FROM property_photos p
     JOIN inventory_items i ON i.id = p.property_id WHERE i.published = 1 ORDER BY p.property_id, p.sort_order, p.created_at`,
  );
  const photosByListing = new Map<string, PhotoRow[]>();
  for (const photo of photos) photosByListing.set(photo.property_id, [...(photosByListing.get(photo.property_id) ?? []), photo]);
  const projectName = new Map<string, string>(WEBSITE_PROJECTS.map((p) => [p.slug, p.name]));
  const site = env.PUBLIC_SITE_URL.replace(/\/$/, "");

  return {
    settings: {
      home: { enabled: settings.home_enabled, heading: settings.home_heading, intro: settings.home_intro, limit: settings.home_limit },
      project: { enabled: settings.project_enabled, heading: settings.project_heading },
    },
    projects: WEBSITE_PROJECTS.map(({ slug, name }) => ({ slug, name })),
    listings: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      url: `${site}/properties/${row.slug}/`,
      project_slug: row.project_slug,
      project_name: row.project_slug ? (projectName.get(row.project_slug) ?? null) : null,
      title: row.web_title || autoTitle(row),
      summary: row.web_summary,
      description: row.web_description,
      type: row.type,
      type_label: INVENTORY_TYPE_LABELS[row.type],
      size: row.size,
      block: row.block,
      number: row.show_number ? row.house_number : null,
      price: row.web_price,
      features: parseJson<string[]>(row.web_features, []),
      status: row.status,
      featured: Boolean(row.featured),
      published_at: row.published_at,
      updated_at: row.updated_at ?? row.created_at,
      photos: (photosByListing.get(row.id) ?? []).map((p) => ({ ...photoUrls(env, p.storage_key), width: p.width, height: p.height, alt: p.alt })),
    })),
  };
}

// Read by the landing build, which renders every listing section and page statically.
export const publicRoutes = new Hono<WorkerEnv>().get("/listings/full", async (c) => c.json(await publishedListings(c.env)));

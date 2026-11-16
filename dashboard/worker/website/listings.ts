import { Hono } from "hono";
import { z } from "zod";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { all, first, newId, nowIso, parseJson, stmt, type Db } from "../db";
import type { AuthedEnv, Env, SessionUser } from "../env";
import { ApiError } from "../http";
import { INVENTORY_TYPE_LABELS, WEBSITE_PROJECTS, WEBSITE_PROJECT_SLUGS, type InventoryType } from "../inventory/fields";
import { zJson, zParam } from "../validation";
import { requestSiteRebuild } from "./rebuild";

export const MAX_PHOTOS = 30;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const text = (max: number) => z.string().max(max).nullish().transform((v) => v?.trim() || null);

const listingUpdate = z
  .object({
    slug: z.string().trim().toLowerCase().max(120).regex(SLUG, "Use lowercase letters, numbers and single hyphens"),
    project_slug: z.enum(WEBSITE_PROJECT_SLUGS).nullable(),
    title: z.string().trim().min(1, "Required").max(160),
    summary: text(300),
    description: text(5000),
    price_text: text(120),
    show_number: z.boolean(),
    features: z.array(z.string().trim().min(1).max(80)).max(20),
    published: z.boolean(),
    featured: z.boolean(),
    sort_order: z.number().int().min(-100000).max(100000),
  })
  .partial();

type ListingRow = {
  id: string;
  inventory_item_id: string;
  slug: string;
  project_slug: (typeof WEBSITE_PROJECT_SLUGS)[number] | null;
  title: string;
  summary: string | null;
  description: string | null;
  price_text: string | null;
  show_number: number;
  features: string;
  published: number;
  featured: number;
  sort_order: number;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
  // From the inventory item.
  house_number: string;
  block: string | null;
  town: string;
  type: InventoryType;
  size: string;
  status: "available" | "sold";
  asking_price: string | null;
  entered_by_user_id: string;
  photo_count: number;
  cover_key: string | null;
};

type PhotoRow = { id: string; storage_key: string; width: number; height: number; alt: string | null; sort_order: number };

const SELECT = `SELECT l.*, i.house_number, i.block, i.town, i.type, i.size, i.status, i.asking_price, i.entered_by_user_id,
    (SELECT COUNT(*) FROM listing_photos p WHERE p.listing_id = l.id) AS photo_count,
    (SELECT p.storage_key FROM listing_photos p WHERE p.listing_id = l.id ORDER BY p.sort_order, p.created_at LIMIT 1) AS cover_key
  FROM website_listings l JOIN inventory_items i ON i.id = l.inventory_item_id`;

export const photoUrls = (env: Env, key: string) => ({ full: `${env.MEDIA_URL}/${key}-1600.webp`, thumb: `${env.MEDIA_URL}/${key}-600.webp` });

function toListing(env: Env, row: ListingRow, user: SessionUser) {
  const { cover_key, entered_by_user_id, house_number, block, town, type, size, status, asking_price, ...listing } = row;
  return {
    ...listing,
    show_number: Boolean(row.show_number),
    published: Boolean(row.published),
    featured: Boolean(row.featured),
    features: parseJson<string[]>(row.features, []),
    cover: cover_key ? photoUrls(env, cover_key) : null,
    item: { house_number, block, town, type, type_label: INVENTORY_TYPE_LABELS[type], size, status, asking_price },
    can_edit: user.role === "admin" || entered_by_user_id === user.id,
  };
}

async function loadListing(env: Env, id: string, user: SessionUser) {
  const row = await first<ListingRow>(env.DB, `${SELECT} WHERE l.id = ?`, [id]);
  if (!row) throw new ApiError(404, "Listing not found");
  return toListing(env, row, user);
}

async function loadEditable(env: Env, id: string, user: SessionUser) {
  const listing = await loadListing(env, id, user);
  if (!listing.can_edit) throw new ApiError(403, "Only admins or whoever entered the property can edit its listing");
  return listing;
}

async function photosOf(env: Env, listingId: string) {
  const rows = await all<PhotoRow>(env.DB, "SELECT id, storage_key, width, height, alt, sort_order FROM listing_photos WHERE listing_id = ? ORDER BY sort_order, created_at", [listingId]);
  return rows.map(({ storage_key, ...photo }) => ({ ...photo, ...photoUrls(env, storage_key) }));
}

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "property";

async function uniqueSlug(db: Db, base: string, exceptId?: string): Promise<string> {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await first<{ id: string }>(db, "SELECT id FROM website_listings WHERE slug = ?", [candidate]);
    if (!taken || taken.id === exceptId) return candidate;
  }
}

/** Matches a town like "Sitara Villas" to the project page it belongs on. */
function guessProject(town: string): (typeof WEBSITE_PROJECT_SLUGS)[number] | null {
  const lower = town.toLowerCase();
  return WEBSITE_PROJECTS.find((p) => lower.includes(p.slug.split("-")[0]!))?.slug ?? null;
}

export const listingRoutes = new Hono<AuthedEnv>()
  .get("/", async (c) => {
    const user = c.get("user");
    const rows = await all<ListingRow>(c.env.DB, `${SELECT} ORDER BY l.published DESC, l.project_slug, l.sort_order, COALESCE(l.updated_at, l.created_at) DESC`);
    return c.json({ listings: rows.map((row) => toListing(c.env, row, user)) });
  })
  .post("/", zJson(z.object({ inventory_item_id: z.string().min(1).max(64) })), async (c) => {
    const db = c.env.DB;
    const user = c.get("user");
    const item = await first<{ id: string; size: string; type: InventoryType; block: string | null; town: string; asking_price: string | null; entered_by_user_id: string }>(
      db,
      "SELECT id, size, type, block, town, asking_price, entered_by_user_id FROM inventory_items WHERE id = ?",
      [c.req.valid("json").inventory_item_id],
    );
    if (!item) throw new ApiError(404, "Inventory item not found");
    if (user.role !== "admin" && item.entered_by_user_id !== user.id) throw new ApiError(403, "Only admins or whoever entered the property can list it");
    if (await first(db, "SELECT id FROM website_listings WHERE inventory_item_id = ?", [item.id])) throw new ApiError(409, "This property already has a listing");
    const project = guessProject(item.town);
    const title = `${item.size} ${INVENTORY_TYPE_LABELS[item.type].toLowerCase()}${item.block ? ` in Block ${item.block}` : ""}`;
    const slug = await uniqueSlug(db, slugify(`${project ?? item.town} ${item.size} ${item.type.replace("_", " ")}${item.block ? ` block ${item.block}` : ""}`));
    const id = newId();
    await stmt(db, "INSERT INTO website_listings (id, inventory_item_id, slug, project_slug, title, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
      id,
      item.id,
      slug,
      project,
      title.charAt(0).toUpperCase() + title.slice(1),
      nowIso(),
    ]).run();
    return c.json(await loadListing(c.env, id, user), 201);
  })
  .get("/:id", zParam(z.object({ id: z.string().min(1).max(64) })), async (c) => {
    const listing = await loadListing(c.env, c.req.valid("param").id, c.get("user"));
    return c.json({ ...listing, photos: await photosOf(c.env, listing.id) });
  })
  .patch("/:id", zParam(z.object({ id: z.string().min(1).max(64) })), zJson(listingUpdate), async (c) => {
    const db = c.env.DB;
    const user = c.get("user");
    const current = await loadEditable(c.env, c.req.valid("param").id, user);
    const body = c.req.valid("json");
    if (body.slug && body.slug !== current.slug && (await first(db, "SELECT id FROM website_listings WHERE slug = ?", [body.slug]))) {
      throw new ApiError(409, "Another listing already uses this web address");
    }
    const columns: Record<string, string | number | null> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      columns[key] = typeof value === "boolean" ? (value ? 1 : 0) : Array.isArray(value) ? JSON.stringify(value) : value;
    }
    if (body.published && !current.published_at) columns.published_at = nowIso();
    const entries = Object.entries(columns);
    if (entries.length) {
      await stmt(db, `UPDATE website_listings SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`, [
        ...entries.map(([, v]) => v),
        nowIso(),
        current.id,
      ]).run();
      if (current.published || body.published) c.executionCtx.waitUntil(requestSiteRebuild(c.env, c.req.url));
    }
    const listing = await loadListing(c.env, current.id, user);
    return c.json({ ...listing, photos: await photosOf(c.env, listing.id) });
  })
  .delete("/:id", zParam(z.object({ id: z.string().min(1).max(64) })), async (c) => {
    const current = await loadEditable(c.env, c.req.valid("param").id, c.get("user"));
    const photos = await all<{ storage_key: string }>(c.env.DB, "SELECT storage_key FROM listing_photos WHERE listing_id = ?", [current.id]);
    if (photos.length) await c.env.PHOTOS.delete(photos.flatMap((p) => [`${p.storage_key}-1600.webp`, `${p.storage_key}-600.webp`]));
    await stmt(c.env.DB, "DELETE FROM website_listings WHERE id = ?", [current.id]).run();
    if (current.published) c.executionCtx.waitUntil(requestSiteRebuild(c.env, c.req.url));
    return c.json({ ok: true });
  })
  // Multipart: `full` (≤1600px WebP), `thumb` (≤600px WebP), `width`, `height`, optional `alt`. The browser does the resizing.
  .post("/:id/photos", zParam(z.object({ id: z.string().min(1).max(64) })), async (c) => {
    const env = c.env;
    const listing = await loadEditable(env, c.req.valid("param").id, c.get("user"));
    if (listing.photo_count >= MAX_PHOTOS) throw new ApiError(400, `A listing can have at most ${MAX_PHOTOS} photos`);
    const form = await c.req.formData();
    const full = form.get("full");
    const thumb = form.get("thumb");
    const width = Number(form.get("width"));
    const height = Number(form.get("height"));
    const alt = String(form.get("alt") ?? "").trim().slice(0, 200) || null;
    const isImage = (f: unknown): f is File => f instanceof File && f.type === "image/webp" && f.size > 0 && f.size <= MAX_PHOTO_BYTES;
    if (!isImage(full) || !isImage(thumb)) throw new ApiError(422, "Upload WebP images under 4 MB (the dashboard converts photos for you)");
    if (!(width > 0 && height > 0 && width <= 4000 && height <= 4000)) throw new ApiError(422, "Missing photo dimensions");
    const id = newId();
    const key = `listings/${listing.id}/${id}`;
    const meta = { httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" } };
    await Promise.all([env.PHOTOS.put(`${key}-1600.webp`, await full.arrayBuffer(), meta), env.PHOTOS.put(`${key}-600.webp`, await thumb.arrayBuffer(), meta)]);
    const next = await first<{ n: number }>(env.DB, "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM listing_photos WHERE listing_id = ?", [listing.id]);
    await stmt(env.DB, "INSERT INTO listing_photos (id, listing_id, storage_key, width, height, alt, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
      id,
      listing.id,
      key,
      Math.round(width),
      Math.round(height),
      alt,
      next?.n ?? 0,
      nowIso(),
    ]).run();
    if (listing.published) c.executionCtx.waitUntil(requestSiteRebuild(env, c.req.url));
    return c.json({ photos: await photosOf(env, listing.id) }, 201);
  })
  .put("/:id/photos", zParam(z.object({ id: z.string().min(1).max(64) })), zJson(z.object({ order: z.array(z.string()).max(MAX_PHOTOS), alts: z.record(z.string(), z.string().max(200)).optional() })), async (c) => {
    const env = c.env;
    const listing = await loadEditable(env, c.req.valid("param").id, c.get("user"));
    const { order, alts = {} } = c.req.valid("json");
    const statements: D1PreparedStatement[] = order.map((photoId, index) =>
      env.DB.prepare("UPDATE listing_photos SET sort_order = ? WHERE id = ? AND listing_id = ?").bind(index, photoId, listing.id),
    );
    for (const [photoId, alt] of Object.entries(alts)) {
      statements.push(env.DB.prepare("UPDATE listing_photos SET alt = ? WHERE id = ? AND listing_id = ?").bind(alt.trim() || null, photoId, listing.id));
    }
    if (statements.length) await env.DB.batch(statements);
    if (listing.published) c.executionCtx.waitUntil(requestSiteRebuild(env, c.req.url));
    return c.json({ photos: await photosOf(env, listing.id) });
  })
  .delete("/:id/photos/:photoId", zParam(z.object({ id: z.string().min(1).max(64), photoId: z.string().min(1).max(64) })), async (c) => {
    const env = c.env;
    const { id, photoId } = c.req.valid("param");
    const listing = await loadEditable(env, id, c.get("user"));
    const photo = await first<{ storage_key: string }>(env.DB, "SELECT storage_key FROM listing_photos WHERE id = ? AND listing_id = ?", [photoId, listing.id]);
    if (!photo) throw new ApiError(404, "Photo not found");
    await env.PHOTOS.delete([`${photo.storage_key}-1600.webp`, `${photo.storage_key}-600.webp`]);
    await stmt(env.DB, "DELETE FROM listing_photos WHERE id = ?", [photoId]).run();
    if (listing.published) c.executionCtx.waitUntil(requestSiteRebuild(env, c.req.url));
    return c.json({ photos: await photosOf(env, listing.id) });
  });

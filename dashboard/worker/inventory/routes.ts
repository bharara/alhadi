import { Hono } from "hono";
import { z } from "zod";
import { all, first, likeContains, newId, nowIso, parseJson, stmt, type Db } from "../db";
import type { AuthedEnv, Env, SessionUser } from "../env";
import { ApiError } from "../http";
import { idParam, optionalText, requiredText, zJson, zParam } from "../validation";
import { MAX_PHOTOS, WEBSITE_PROJECTS, WEBSITE_PROJECT_SLUGS, type WebsiteProjectSlug } from "../website/fields";
import { deletePhotos, photoUrls, putPhoto } from "../website/photos";
import { requestSiteRebuild } from "../website/rebuild";
import { autoTitle, CONTACT_KINDS, INVENTORY_STATUSES, INVENTORY_TYPES, type InventoryType } from "./fields";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const internalShape = {
  house_number: requiredText(255),
  block: optionalText(255),
  town: requiredText(255),
  type: z.enum(INVENTORY_TYPES),
  status: z.enum(INVENTORY_STATUSES),
  size: requiredText(255),
  details: optionalText(20000),
  asking_price: optionalText(255),
  contact_phone_number: requiredText(64),
  contact_name: requiredText(255),
  contact_kind: z.enum(CONTACT_KINDS),
};

// What the public site shows; stored in the web columns of the same row.
const webUpdate = z
  .object({
    project_slug: z.enum(WEBSITE_PROJECT_SLUGS).nullable(),
    slug: z.string().trim().toLowerCase().max(120).regex(SLUG, "Use lowercase letters, numbers and single hyphens"),
    title: optionalText(160),
    summary: optionalText(300),
    description: optionalText(5000),
    price: optionalText(120),
    features: z.array(z.string().trim().min(1).max(80)).max(20),
    show_number: z.boolean(),
    published: z.boolean(),
    featured: z.boolean(),
    order: z.number().int().min(-100000).max(100000),
  })
  .partial();

const itemCreate = z.object(internalShape).extend({
  status: internalShape.status.default("available"),
  contact_kind: internalShape.contact_kind.default("direct"),
});
const itemUpdate = z.object(internalShape).partial().extend({ web: webUpdate.optional() });

const searchSchema = z.object({
  search: z.string().max(255).nullish(),
  town: z.string().max(255).nullish(),
  block: z.string().max(255).nullish(),
  type: z.enum(INVENTORY_TYPES).nullish(),
  status: z.enum(INVENTORY_STATUSES).nullish(),
  project_slug: z.enum(WEBSITE_PROJECT_SLUGS).nullish(),
  on_website: z.boolean().nullish(),
  order: z.enum(["recent", "website"]).default("recent"),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

const photoUpload = z.object({
  full: z.instanceof(File),
  thumb: z.instanceof(File),
  width: z.coerce.number().int().min(1).max(4000),
  height: z.coerce.number().int().min(1).max(4000),
  alt: optionalText(200),
});

type ItemRow = {
  id: string;
  created_at: string;
  updated_at: string | null;
  house_number: string;
  block: string | null;
  town: string;
  type: InventoryType;
  status: (typeof INVENTORY_STATUSES)[number];
  size: string;
  details: string | null;
  asking_price: string | null;
  contact_phone_number: string;
  contact_name: string;
  contact_kind: (typeof CONTACT_KINDS)[number];
  entered_by_user_id: string;
  entered_by_username: string | null;
  project_slug: WebsiteProjectSlug | null;
  slug: string | null;
  web_title: string | null;
  web_summary: string | null;
  web_description: string | null;
  web_price: string | null;
  web_features: string;
  show_number: number;
  published: number;
  featured: number;
  web_order: number;
  published_at: string | null;
  photo_count: number;
  cover_key: string | null;
};

type PhotoRow = { id: string; storage_key: string; width: number; height: number; alt: string | null; sort_order: number };

// Inventory fields a published property shows on the site, besides its web fields.
const PUBLIC_FIELDS = ["house_number", "block", "type", "status", "size"];

const SELECT = `SELECT i.*, u.username AS entered_by_username,
    (SELECT COUNT(*) FROM property_photos p WHERE p.property_id = i.id) AS photo_count,
    (SELECT p.storage_key FROM property_photos p WHERE p.property_id = i.id ORDER BY p.sort_order, p.created_at LIMIT 1) AS cover_key
  FROM inventory_items i LEFT JOIN users u ON u.id = i.entered_by_user_id`;

function toItem(env: Env, row: ItemRow, user: SessionUser) {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    house_number: row.house_number,
    block: row.block,
    town: row.town,
    type: row.type,
    status: row.status,
    size: row.size,
    details: row.details,
    asking_price: row.asking_price,
    contact_phone_number: row.contact_phone_number,
    contact_name: row.contact_name,
    contact_kind: row.contact_kind,
    entered_by_user_id: row.entered_by_user_id,
    entered_by_username: row.entered_by_username,
    web: {
      project_slug: row.project_slug,
      slug: row.slug,
      title: row.web_title,
      auto_title: autoTitle(row),
      summary: row.web_summary,
      description: row.web_description,
      price: row.web_price,
      features: parseJson<string[]>(row.web_features, []),
      show_number: Boolean(row.show_number),
      published: Boolean(row.published),
      featured: Boolean(row.featured),
      order: row.web_order,
      published_at: row.published_at,
      photo_count: row.photo_count,
      cover: row.cover_key ? photoUrls(env, row.cover_key) : null,
    },
    can_edit: user.role === "admin" || row.entered_by_user_id === user.id,
  };
}
type Item = ReturnType<typeof toItem>;

async function loadItem(env: Env, id: string, user: SessionUser): Promise<Item> {
  const row = await first<ItemRow>(env.DB, `${SELECT} WHERE i.id = ?`, [id]);
  if (!row) throw new ApiError(404, "Property not found");
  return toItem(env, row, user);
}

async function loadEditable(env: Env, id: string, user: SessionUser): Promise<Item> {
  const item = await loadItem(env, id, user);
  if (!item.can_edit) throw new ApiError(403, "Only admins or whoever entered this property can change it");
  return item;
}

async function photosOf(env: Env, propertyId: string) {
  const rows = await all<PhotoRow>(env.DB, "SELECT id, storage_key, width, height, alt, sort_order FROM property_photos WHERE property_id = ? ORDER BY sort_order, created_at", [propertyId]);
  return rows.map(({ storage_key, ...photo }) => ({ ...photo, ...photoUrls(env, storage_key) }));
}

const photoKeysOf = async (db: Db, propertyId: string) =>
  (await all<{ storage_key: string }>(db, "SELECT storage_key FROM property_photos WHERE property_id = ?", [propertyId])).map((p) => p.storage_key);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "property";

async function uniqueSlug(db: Db, base: string, exceptId: string): Promise<string> {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await first<{ id: string }>(db, "SELECT id FROM inventory_items WHERE slug = ?", [candidate]);
    if (!taken || taken.id === exceptId) return candidate;
  }
}

const guessProject = (town: string): WebsiteProjectSlug | null => WEBSITE_PROJECTS.find((p) => town.toLowerCase().includes(p.town))?.slug ?? null;

/** Column values for a web update; publishing fills in a project, web address and publish date when missing. */
async function webColumns(db: Db, item: Item, web: z.infer<typeof webUpdate>): Promise<Record<string, string | number | null>> {
  const columns: Record<string, string | number | null> = {};
  const set = (column: string, value: unknown) => {
    if (value !== undefined) columns[column] = typeof value === "boolean" ? (value ? 1 : 0) : Array.isArray(value) ? JSON.stringify(value) : (value as string | number | null);
  };
  set("project_slug", web.project_slug);
  set("web_title", web.title);
  set("web_summary", web.summary);
  set("web_description", web.description);
  set("web_price", web.price);
  set("web_features", web.features);
  set("show_number", web.show_number);
  set("published", web.published);
  set("featured", web.featured);
  set("web_order", web.order);
  if (web.slug !== undefined && web.slug !== item.web.slug) {
    if (await first(db, "SELECT id FROM inventory_items WHERE slug = ? AND id != ?", [web.slug, item.id])) throw new ApiError(409, "Another property already uses this web address");
    columns.slug = web.slug;
  }
  if (web.published) {
    const project = web.project_slug !== undefined ? web.project_slug : (item.web.project_slug ?? guessProject(item.town));
    if (web.project_slug === undefined && !item.web.project_slug) columns.project_slug = project;
    if (!(columns.slug ?? item.web.slug)) {
      columns.slug = await uniqueSlug(db, slugify(`${project ?? item.town} ${item.size} ${item.type.replace("_", " ")}${item.block ? ` block ${item.block}` : ""}`), item.id);
    }
    if (!item.web.published_at) columns.published_at = nowIso();
  }
  return columns;
}

export const inventoryRoutes = new Hono<AuthedEnv>()
  .post("/search", zJson(searchSchema), async (c) => {
    const body = c.req.valid("json");
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    const search = body.search?.trim();
    if (search) {
      const fields = ["i.house_number", "i.block", "i.town", "i.size", "i.details", "i.asking_price", "i.contact_phone_number", "i.contact_name", "u.username", "i.web_title"];
      clauses.push(`(${fields.map((f) => `${f} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
      params.push(...fields.map(() => likeContains(search)));
    }
    if (body.town) clauses.push("i.town = ?"), params.push(body.town);
    if (body.block?.trim()) clauses.push("i.block LIKE ? ESCAPE '\\'"), params.push(likeContains(body.block.trim()));
    if (body.type) clauses.push("i.type = ?"), params.push(body.type);
    if (body.status) clauses.push("i.status = ?"), params.push(body.status);
    if (body.project_slug) clauses.push("i.project_slug = ?"), params.push(body.project_slug);
    if (body.on_website != null) clauses.push("i.published = ?"), params.push(body.on_website ? 1 : 0);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const order = body.order === "website" ? "i.project_slug, i.web_order, i.published_at DESC, i.id" : "COALESCE(i.updated_at, i.created_at) DESC, i.id";
    const db = c.env.DB;
    const [rows, count] = await db.batch([
      stmt(db, `${SELECT} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, body.limit, body.offset]),
      stmt(db, `SELECT COUNT(*) AS n FROM inventory_items i LEFT JOIN users u ON u.id = i.entered_by_user_id ${where}`, params),
    ]);
    const user = c.get("user");
    return c.json({
      items: (rows!.results as ItemRow[]).map((row) => toItem(c.env, row, user)),
      total: (count!.results[0] as { n: number } | undefined)?.n ?? 0,
      limit: body.limit,
      offset: body.offset,
    });
  })
  .get("/towns", async (c) => {
    const rows = await all<{ town: string }>(c.env.DB, "SELECT DISTINCT town FROM inventory_items WHERE trim(town) != '' ORDER BY town");
    return c.json({ towns: rows.map((r) => r.town) });
  })
  .post("/", zJson(itemCreate), async (c) => {
    const body = c.req.valid("json");
    const id = newId();
    const entries = Object.entries(body);
    const names = ["id", "entered_by_user_id", "created_at", ...entries.map(([k]) => k)];
    await stmt(c.env.DB, `INSERT INTO inventory_items (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`, [
      id,
      c.get("user").id,
      nowIso(),
      ...entries.map(([, v]) => (v ?? null) as string | null),
    ]).run();
    return c.json(await loadItem(c.env, id, c.get("user")), 201);
  })
  .get("/:id", zParam(idParam), async (c) => {
    const item = await loadItem(c.env, c.req.valid("param").id, c.get("user"));
    return c.json({ ...item, photos: await photosOf(c.env, item.id) });
  })
  .patch("/:id", zParam(idParam), zJson(itemUpdate), async (c) => {
    const env = c.env;
    const user = c.get("user");
    const current = await loadEditable(env, c.req.valid("param").id, user);
    const { web, ...internal } = c.req.valid("json");
    const columns: Record<string, string | number | null> = {};
    for (const [key, value] of Object.entries(internal)) if (value !== undefined) columns[key] = (value ?? null) as string | null;
    const webCols = web ? await webColumns(env.DB, current, web) : {};
    Object.assign(columns, webCols);
    const entries = Object.entries(columns);
    if (entries.length) {
      await stmt(env.DB, `UPDATE inventory_items SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`, [
        ...entries.map(([, v]) => v),
        nowIso(),
        current.id,
      ]).run();
      const touchesSite = Object.keys(webCols).length > 0 || Object.keys(internal).some((k) => PUBLIC_FIELDS.includes(k));
      if (touchesSite && (current.web.published || web?.published)) await requestSiteRebuild(env);
    }
    const item = await loadItem(env, current.id, user);
    return c.json({ ...item, photos: await photosOf(env, item.id) });
  })
  .delete("/:id", zParam(idParam), async (c) => {
    const env = c.env;
    const current = await loadEditable(env, c.req.valid("param").id, c.get("user"));
    const keys = await photoKeysOf(env.DB, current.id);
    await stmt(env.DB, "DELETE FROM inventory_items WHERE id = ?", [current.id]).run();
    c.executionCtx.waitUntil(deletePhotos(env, keys));
    if (current.web.published) await requestSiteRebuild(env);
    return c.json({ ok: true });
  })
  // The browser resizes photos to WebP before uploading (see src/pages/inventory/photos.ts).
  .post("/:id/photos", zParam(idParam), async (c) => {
    const env = c.env;
    const item = await loadEditable(env, c.req.valid("param").id, c.get("user"));
    if (item.web.photo_count >= MAX_PHOTOS) throw new ApiError(400, `A property can have at most ${MAX_PHOTOS} photos`);
    const parsed = photoUpload.safeParse(Object.fromEntries((await c.req.formData()).entries()));
    const isWebp = (f: File) => f.type === "image/webp" && f.size > 0 && f.size <= MAX_PHOTO_BYTES;
    if (!parsed.success || !isWebp(parsed.data.full) || !isWebp(parsed.data.thumb)) throw new ApiError(422, "Upload WebP images under 4 MB (the dashboard converts photos for you)");
    const { full, thumb, width, height, alt } = parsed.data;
    const id = newId();
    const key = `properties/${item.id}/${id}`;
    await putPhoto(env, key, await full.arrayBuffer(), await thumb.arrayBuffer());
    try {
      await stmt(
        env.DB,
        `INSERT INTO property_photos (id, property_id, storage_key, width, height, alt, sort_order, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM property_photos WHERE property_id = ?2), ?7)`,
        [id, item.id, key, width, height, alt, nowIso()],
      ).run();
    } catch (error) {
      // Photos have no lifecycle expiry, so a failed insert must not leave files behind.
      await deletePhotos(env, [key]);
      throw error;
    }
    if (item.web.published) await requestSiteRebuild(env);
    return c.json({ photos: await photosOf(env, item.id) }, 201);
  })
  .put("/:id/photos", zParam(idParam), zJson(z.object({ order: z.array(z.string()).max(MAX_PHOTOS), alts: z.record(z.string(), z.string().max(200)).optional() })), async (c) => {
    const env = c.env;
    const item = await loadEditable(env, c.req.valid("param").id, c.get("user"));
    const { order, alts = {} } = c.req.valid("json");
    const statements = [
      ...order.map((photoId, index) => env.DB.prepare("UPDATE property_photos SET sort_order = ? WHERE id = ? AND property_id = ?").bind(index, photoId, item.id)),
      ...Object.entries(alts).map(([photoId, alt]) => env.DB.prepare("UPDATE property_photos SET alt = ? WHERE id = ? AND property_id = ?").bind(alt.trim() || null, photoId, item.id)),
    ];
    if (statements.length) await env.DB.batch(statements);
    if (item.web.published) await requestSiteRebuild(env);
    return c.json({ photos: await photosOf(env, item.id) });
  })
  .delete("/:id/photos/:photoId", zParam(idParam.extend({ photoId: z.string().min(1).max(64) })), async (c) => {
    const env = c.env;
    const { id, photoId } = c.req.valid("param");
    const item = await loadEditable(env, id, c.get("user"));
    const photo = await first<{ storage_key: string }>(env.DB, "SELECT storage_key FROM property_photos WHERE id = ? AND property_id = ?", [photoId, item.id]);
    if (!photo) throw new ApiError(404, "Photo not found");
    await stmt(env.DB, "DELETE FROM property_photos WHERE id = ?", [photoId]).run();
    c.executionCtx.waitUntil(deletePhotos(env, [photo.storage_key]));
    if (item.web.published) await requestSiteRebuild(env);
    return c.json({ photos: await photosOf(env, item.id) });
  });

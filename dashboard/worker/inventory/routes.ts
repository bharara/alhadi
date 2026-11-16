import { Hono } from "hono";
import { z } from "zod";
import { all, first, likeContains, newId, nowIso, stmt, type Db } from "../db";
import type { AuthedEnv, SessionUser } from "../env";
import { ApiError } from "../http";
import { idParam, zJson, zParam } from "../validation";
import { requestSiteRebuild } from "../website/rebuild";
import { CONTACT_KINDS, INVENTORY_STATUSES, INVENTORY_TYPES } from "./fields";

const text = (max: number) => z.string().max(max).nullish().transform((v) => v?.trim() || null);
const required = (max: number) => z.string().trim().min(1, "Required").max(max);

const itemShape = {
  house_number: required(255),
  block: text(255),
  town: required(255),
  type: z.enum(INVENTORY_TYPES),
  status: z.enum(INVENTORY_STATUSES),
  size: required(255),
  details: text(20000),
  asking_price: text(255),
  contact_phone_number: required(64),
  contact_name: required(255),
  contact_kind: z.enum(CONTACT_KINDS),
};

const itemFields = z.object(itemShape).extend({
  status: itemShape.status.default("available"),
  contact_kind: itemShape.contact_kind.default("direct"),
});

// Updates apply only the keys sent.
const itemUpdate = z.object(itemShape).partial();

const searchSchema = z.object({
  search: z.string().max(255).nullish(),
  town: z.string().max(255).nullish(),
  block: z.string().max(255).nullish(),
  type: z.enum(INVENTORY_TYPES).nullish(),
  status: z.enum(INVENTORY_STATUSES).nullish(),
  /** true: has a published website listing; false: has none (or a draft). */
  on_website: z.boolean().nullish(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

type ItemRow = {
  id: string;
  created_at: string;
  updated_at: string | null;
  house_number: string;
  block: string | null;
  town: string;
  type: (typeof INVENTORY_TYPES)[number];
  status: (typeof INVENTORY_STATUSES)[number];
  size: string;
  details: string | null;
  asking_price: string | null;
  contact_phone_number: string;
  contact_name: string;
  contact_kind: (typeof CONTACT_KINDS)[number];
  entered_by_user_id: string;
  entered_by_username: string | null;
  listing_id: string | null;
  listing_slug: string | null;
  listing_published: number | null;
};

const SELECT = `SELECT i.*, u.username AS entered_by_username, l.id AS listing_id, l.slug AS listing_slug, l.published AS listing_published
  FROM inventory_items i
  LEFT JOIN users u ON u.id = i.entered_by_user_id
  LEFT JOIN website_listings l ON l.inventory_item_id = i.id`;

const toItem = (row: ItemRow, user: SessionUser) => {
  const { listing_id, listing_slug, listing_published, ...item } = row;
  return {
    ...item,
    listing: listing_id ? { id: listing_id, slug: listing_slug!, published: Boolean(listing_published) } : null,
    can_edit: user.role === "admin" || row.entered_by_user_id === user.id,
  };
};

async function loadItem(db: Db, id: string, user: SessionUser) {
  const row = await first<ItemRow>(db, `${SELECT} WHERE i.id = ?`, [id]);
  if (!row) throw new ApiError(404, "Inventory item not found");
  return toItem(row, user);
}

export const inventoryRoutes = new Hono<AuthedEnv>()
  .post("/search", zJson(searchSchema), async (c) => {
    const body = c.req.valid("json");
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    const search = body.search?.trim();
    if (search) {
      const fields = ["i.house_number", "i.block", "i.town", "i.size", "i.details", "i.asking_price", "i.contact_phone_number", "i.contact_name", "u.username", "l.title"];
      clauses.push(`(${fields.map((f) => `${f} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
      params.push(...fields.map(() => likeContains(search)));
    }
    if (body.town) clauses.push("i.town = ?"), params.push(body.town);
    if (body.block?.trim()) clauses.push("i.block LIKE ? ESCAPE '\\'"), params.push(likeContains(body.block.trim()));
    if (body.type) clauses.push("i.type = ?"), params.push(body.type);
    if (body.status) clauses.push("i.status = ?"), params.push(body.status);
    if (body.on_website === true) clauses.push("l.published = 1");
    if (body.on_website === false) clauses.push("(l.id IS NULL OR l.published = 0)");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const db = c.env.DB;
    const [rows, count] = await db.batch([
      stmt(db, `${SELECT} ${where} ORDER BY COALESCE(i.updated_at, i.created_at) DESC, i.created_at DESC LIMIT ? OFFSET ?`, [...params, body.limit, body.offset]),
      stmt(
        db,
        `SELECT COUNT(*) AS n FROM inventory_items i LEFT JOIN users u ON u.id = i.entered_by_user_id LEFT JOIN website_listings l ON l.inventory_item_id = i.id ${where}`,
        params,
      ),
    ]);
    const user = c.get("user");
    return c.json({
      items: (rows!.results as ItemRow[]).map((row) => toItem(row, user)),
      total: (count!.results[0] as { n: number } | undefined)?.n ?? 0,
      limit: body.limit,
      offset: body.offset,
    });
  })
  .get("/towns", async (c) => {
    const rows = await all<{ town: string }>(c.env.DB, "SELECT DISTINCT town FROM inventory_items WHERE trim(town) != '' ORDER BY town");
    return c.json({ towns: rows.map((r) => r.town) });
  })
  .post("/", zJson(itemFields), async (c) => {
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
    return c.json(await loadItem(c.env.DB, id, c.get("user")), 201);
  })
  .get("/:id", zParam(idParam), async (c) => c.json(await loadItem(c.env.DB, c.req.valid("param").id, c.get("user"))))
  .patch("/:id", zParam(idParam), zJson(itemUpdate), async (c) => {
    const db = c.env.DB;
    const user = c.get("user");
    const current = await loadItem(db, c.req.valid("param").id, user);
    if (!current.can_edit) throw new ApiError(403, "Only admins or the creator can edit this inventory item");
    const entries = Object.entries(c.req.valid("json")).filter(([, v]) => v !== undefined);
    if (entries.length) {
      await stmt(db, `UPDATE inventory_items SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`, [
        ...entries.map(([, v]) => (v ?? null) as string | null),
        nowIso(),
        current.id,
      ]).run();
      // Size, type, block or sold status show on the published listing.
      if (current.listing?.published) c.executionCtx.waitUntil(requestSiteRebuild(c.env, c.req.url));
    }
    return c.json(await loadItem(db, current.id, user));
  })
  .delete("/:id", zParam(idParam), async (c) => {
    const current = await loadItem(c.env.DB, c.req.valid("param").id, c.get("user"));
    if (!current.can_edit) throw new ApiError(403, "Only admins or the creator can delete this inventory item");
    if (current.listing) await c.env.PHOTOS.delete(await photoKeysFor(c.env.DB, current.listing.id));
    await stmt(c.env.DB, "DELETE FROM inventory_items WHERE id = ?", [current.id]).run();
    if (current.listing?.published) c.executionCtx.waitUntil(requestSiteRebuild(c.env, c.req.url));
    return c.json({ ok: true });
  });

async function photoKeysFor(db: Db, listingId: string): Promise<string[]> {
  const rows = await all<{ storage_key: string }>(db, "SELECT storage_key FROM listing_photos WHERE listing_id = ?", [listingId]);
  return rows.flatMap((r) => [`${r.storage_key}-1600.webp`, `${r.storage_key}-600.webp`]);
}

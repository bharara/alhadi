import { Hono } from "hono";
import { z } from "zod";
import { all, first, likeContains, newId, nowIso, stmt, type Db } from "../db";
import type { AuthedEnv, SessionUser } from "../env";
import { ApiError } from "../http";
import { idParam, zJson, zParam } from "../validation";
import { purgePublicListings } from "../website/public";
import { CONTACT_KINDS, INVENTORY_STATUSES, INVENTORY_TYPES, WEBSITE_PROJECT_SLUGS } from "./fields";

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
  project_slug: z.enum(WEBSITE_PROJECT_SLUGS).nullish(),
  published: z.boolean(),
  featured: z.boolean(),
  show_price: z.boolean(),
  show_number: z.boolean(),
  public_title: text(255),
  public_details: text(2000),
  website_order: z.number().int().min(-100000).max(100000),
};

const itemFields = z.object(itemShape).extend({
  status: itemShape.status.default("available"),
  contact_kind: itemShape.contact_kind.default("direct"),
  published: itemShape.published.default(false),
  featured: itemShape.featured.default(false),
  show_price: itemShape.show_price.default(false),
  show_number: itemShape.show_number.default(false),
  website_order: itemShape.website_order.default(0),
});

// Updates apply only the keys sent.
const itemUpdate = z.object(itemShape).partial();

const searchSchema = z.object({
  search: z.string().max(255).nullish(),
  town: z.string().max(255).nullish(),
  block: z.string().max(255).nullish(),
  type: z.enum(INVENTORY_TYPES).nullish(),
  status: z.enum(INVENTORY_STATUSES).nullish(),
  project_slug: z.enum(WEBSITE_PROJECT_SLUGS).nullish(),
  published: z.boolean().nullish(),
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
  project_slug: (typeof WEBSITE_PROJECT_SLUGS)[number] | null;
  published: number;
  featured: number;
  show_price: number;
  show_number: number;
  public_title: string | null;
  public_details: string | null;
  website_order: number;
};

const BOOLEAN_COLUMNS = ["published", "featured", "show_price", "show_number"] as const;
const SELECT = `SELECT i.*, u.username AS entered_by_username FROM inventory_items i LEFT JOIN users u ON u.id = i.entered_by_user_id`;

const toItem = (row: ItemRow, user: SessionUser) => ({
  ...row,
  published: Boolean(row.published),
  featured: Boolean(row.featured),
  show_price: Boolean(row.show_price),
  show_number: Boolean(row.show_number),
  can_edit: user.role === "admin" || row.entered_by_user_id === user.id,
});

async function loadItem(db: Db, id: string, user: SessionUser) {
  const row = await first<ItemRow>(db, `${SELECT} WHERE i.id = ?`, [id]);
  if (!row) throw new ApiError(404, "Inventory item not found");
  return toItem(row, user);
}

const columnValue = (key: string, value: unknown) => ((BOOLEAN_COLUMNS as readonly string[]).includes(key) ? (value ? 1 : 0) : (value ?? null)) as string | number | null;

export const inventoryRoutes = new Hono<AuthedEnv>()
  .post("/search", zJson(searchSchema), async (c) => {
    const body = c.req.valid("json");
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    const search = body.search?.trim();
    if (search) {
      const fields = ["i.house_number", "i.block", "i.town", "i.size", "i.details", "i.asking_price", "i.contact_phone_number", "i.contact_name", "u.username", "i.public_title"];
      clauses.push(`(${fields.map((f) => `${f} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
      params.push(...fields.map(() => likeContains(search)));
    }
    if (body.town) clauses.push("i.town = ?"), params.push(body.town);
    if (body.block?.trim()) clauses.push("i.block LIKE ? ESCAPE '\\'"), params.push(likeContains(body.block.trim()));
    if (body.type) clauses.push("i.type = ?"), params.push(body.type);
    if (body.status) clauses.push("i.status = ?"), params.push(body.status);
    if (body.project_slug) clauses.push("i.project_slug = ?"), params.push(body.project_slug);
    if (body.published != null) clauses.push("i.published = ?"), params.push(body.published ? 1 : 0);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const db = c.env.DB;
    const order = body.published ? "i.website_order, COALESCE(i.updated_at, i.created_at) DESC" : "COALESCE(i.updated_at, i.created_at) DESC, i.created_at DESC";
    const [rows, count] = await db.batch([
      stmt(db, `${SELECT} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, body.limit, body.offset]),
      stmt(db, `SELECT COUNT(*) AS n FROM inventory_items i LEFT JOIN users u ON u.id = i.entered_by_user_id ${where}`, params),
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
    await stmt(
      c.env.DB,
      `INSERT INTO inventory_items (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
      [id, c.get("user").id, nowIso(), ...entries.map(([k, v]) => columnValue(k, v))],
    ).run();
    if (body.published) c.executionCtx.waitUntil(purgePublicListings(c.req.url));
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
        ...entries.map(([k, v]) => columnValue(k, v)),
        nowIso(),
        current.id,
      ]).run();
      c.executionCtx.waitUntil(purgePublicListings(c.req.url));
    }
    return c.json(await loadItem(db, current.id, user));
  })
  .delete("/:id", zParam(idParam), async (c) => {
    const current = await loadItem(c.env.DB, c.req.valid("param").id, c.get("user"));
    if (!current.can_edit) throw new ApiError(403, "Only admins or the creator can delete this inventory item");
    await stmt(c.env.DB, "DELETE FROM inventory_items WHERE id = ?", [current.id]).run();
    if (current.published) c.executionCtx.waitUntil(purgePublicListings(c.req.url));
    return c.json({ ok: true });
  });

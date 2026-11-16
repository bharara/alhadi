import { Hono } from "hono";
import { z } from "zod";
import { all, likeContains, newId, nowIso, stmt } from "../db";
import type { AuthedEnv } from "../env";
import { ApiError } from "../http";
import { requestSiteRebuild } from "../site-build";
import { idParam, optionalText, requiredText, zJson, zParam } from "../validation";
import { CONTACT_KINDS, INVENTORY_STATUSES, INVENTORY_TYPES, WEBSITE_PROJECT_SLUGS } from "./fields";
import { deletePhotos } from "./photo-storage";
import { photoRoutes } from "./photos";
import { loadEditable, loadItem, SELECT, toItem, type ItemRow } from "./store";
import { impliedWebColumns, webFields } from "./web";

const internalFields = {
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

const itemCreate = z.object(internalFields).extend({
  status: internalFields.status.default("available"),
  contact_kind: internalFields.contact_kind.default("direct"),
});
const itemUpdate = z.object({ ...internalFields, ...webFields }).partial();

const searchSchema = z.object({
  search: z.string().max(255).nullish(),
  town: z.string().max(255).nullish(),
  block: z.string().max(255).nullish(),
  type: z.enum(INVENTORY_TYPES).nullish(),
  status: z.enum(INVENTORY_STATUSES).nullish(),
  project_slug: z.enum(WEBSITE_PROJECT_SLUGS).nullish(),
  published: z.boolean().nullish(),
  order: z.enum(["recent", "website"]).default("recent"),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

// Inventory fields a published property shows on the site.
const PUBLIC_FIELDS = new Set(["house_number", "block", "type", "status", "size", ...Object.keys(webFields)]);

const column = (value: unknown) => (typeof value === "boolean" ? (value ? 1 : 0) : Array.isArray(value) ? JSON.stringify(value) : (value ?? null)) as string | number | null;

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
    if (body.published != null) clauses.push("i.published = ?"), params.push(body.published ? 1 : 0);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const order = body.order === "website" ? "i.web_order, i.project_slug, i.id" : "COALESCE(i.updated_at, i.created_at) DESC, i.id";
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
  // The website's display order: published properties in the order given, numbered 10, 20, 30…
  .put("/web-order", zJson(z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(500) })), async (c) => {
    const env = c.env;
    if (c.get("user").role !== "admin") throw new ApiError(403, "Admin access required");
    const now = nowIso();
    await env.DB.batch(c.req.valid("json").ids.map((id, index) => env.DB.prepare("UPDATE inventory_items SET web_order = ?, updated_at = ? WHERE id = ? AND published = 1").bind((index + 1) * 10, now, id)));
    await requestSiteRebuild(env);
    return c.json({ ok: true });
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
      ...entries.map(([, v]) => column(v)),
    ]).run();
    return c.json(await loadItem(c.env, id, c.get("user")), 201);
  })
  .get("/:id", zParam(idParam), async (c) => c.json(await loadItem(c.env, c.req.valid("param").id, c.get("user"))))
  .patch("/:id", zParam(idParam), zJson(itemUpdate), async (c) => {
    const env = c.env;
    const user = c.get("user");
    const current = await loadEditable(env, c.req.valid("param").id, user);
    const changes = Object.fromEntries(Object.entries(c.req.valid("json")).filter(([, v]) => v !== undefined));
    const columns = { ...Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, column(v)])), ...(await impliedWebColumns(env.DB, current, changes)) };
    const entries = Object.entries(columns);
    if (entries.length) {
      try {
        await stmt(env.DB, `UPDATE inventory_items SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`, [...entries.map(([, v]) => v), nowIso(), current.id]).run();
      } catch (error) {
        if (String(error).includes("UNIQUE")) throw new ApiError(409, "Another property already uses this web address");
        throw error;
      }
      if ((current.published || changes.published) && Object.keys(changes).some((k) => PUBLIC_FIELDS.has(k))) await requestSiteRebuild(env);
    }
    return c.json(await loadItem(env, current.id, user));
  })
  .delete("/:id", zParam(idParam), async (c) => {
    const env = c.env;
    const current = await loadEditable(env, c.req.valid("param").id, c.get("user"));
    const keys = (await all<{ storage_key: string }>(env.DB, "SELECT storage_key FROM property_photos WHERE property_id = ?", [current.id])).map((p) => p.storage_key);
    await stmt(env.DB, "DELETE FROM inventory_items WHERE id = ?", [current.id]).run();
    c.executionCtx.waitUntil(deletePhotos(env, keys));
    if (current.published) await requestSiteRebuild(env);
    return c.json({ ok: true });
  })
  .route("/:id/photos", photoRoutes);

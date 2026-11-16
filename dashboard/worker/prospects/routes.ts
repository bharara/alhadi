import { Hono } from "hono";
import { z } from "zod";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { all, batch, chunk, first, IN_CHUNK, newId, nowIso, parseJson, placeholders, run, stmt } from "../db";
import type { AuthedEnv } from "../env";
import { ApiError } from "../http";
import { idParam, isoInstant, zJson, zParam } from "../validation";
import {
  normalizePhoneOrThrow,
  normalizeProspectFields,
  normalizeTags,
  PROSPECT_STATUSES,
  prospectFieldsSchema,
  TOUCH_KINDS,
  type ProspectColumns,
} from "./fields";
import { importProspects } from "./import";
import {
  assertUserExists,
  FIELD_FILTER_FIELD,
  FIELD_FILTER_OPERATORS,
  insertProspect,
  loadProspect,
  PROSPECT_SELECT,
  prospectWhere,
  refreshLastTouch,
  toProspect,
  updateProspect,
  type ProspectRow,
} from "./store";

const idList = z.array(z.string().min(1).max(64)).min(1).max(5000);

const searchSchema = z.object({
  search: z.string().max(255).nullish(),
  status: z.enum(PROSPECT_STATUSES).nullish(),
  field_filters: z
    .array(
      z.object({
        field: z.string().regex(FIELD_FILTER_FIELD, "Unknown field"),
        operator: z.enum(FIELD_FILTER_OPERATORS),
        value: z.string().max(255).nullish(),
      }),
    )
    .max(20)
    .optional(),
  last_touched_before: isoInstant.nullish(),
  last_touched_after: isoInstant.nullish(),
  touched: z.boolean().nullish(),
  touch_kind: z.enum(TOUCH_KINDS).nullish(),
  assigned_user_id: z.string().max(64).nullish(),
  limit: z.number().int().min(1).max(5000).default(100),
  offset: z.number().int().min(0).default(0),
});

const touchSchema = z.object({
  kind: z.enum(TOUCH_KINDS),
  occurred_at: isoInstant,
  summary: z.string().max(20000).nullish(),
  call_status: z.string().max(64).nullish(),
});

const taskActionSchema = z.object({
  kind: z.enum(TOUCH_KINDS).default("call"),
  call_status: z.string().max(64).nullish(),
  summary: z.string().max(20000).nullish(),
  status: z.enum(PROSPECT_STATUSES).nullish(),
  // null clears the follow-up; leaving it out keeps it.
  next_touch_at: isoInstant.nullable().optional(),
});

type TouchRow = {
  id: string;
  created_at: string;
  updated_at: string | null;
  prospect_id: string;
  touching_user_id: string;
  touching_user_username: string | null;
  kind: string;
  occurred_at: string;
  summary: string | null;
  call_status: string | null;
};

const TOUCH_SELECT = `SELECT t.*, u.username AS touching_user_username FROM prospect_touches t LEFT JOIN users u ON u.id = t.touching_user_id`;

const normalizeCallStatus = (value: string | null | undefined) => value?.trim().toLowerCase().replace(/\s+/g, "_") || null;

export const prospectRoutes = new Hono<AuthedEnv>()
  .post("/", zJson(prospectFieldsSchema), async (c) => {
    const db = c.env.DB;
    const body = c.req.valid("json");
    await assertUserExists(db, body.assigned_user_id);
    // Adding a lead whose phone is already known updates that lead instead.
    const existing = await first<{ id: string; extra: string }>(db, "SELECT id, extra FROM prospects WHERE phone = ?", [normalizePhoneOrThrow(body.phone).primary]);
    const columns = normalizeProspectFields(body, existing ? parseJson(existing.extra, {}) : null);
    if (existing) {
      await updateProspect(db, existing.id, columns).run();
      return c.json({ prospect: await loadProspect(db, existing.id), created: false });
    }
    const id = newId();
    await insertProspect(db, id, columns).run();
    return c.json({ prospect: await loadProspect(db, id), created: true });
  })
  .post("/import", zJson(z.object({ prospects: z.array(prospectFieldsSchema.extend({ phone: z.string().max(64).nullish() })).max(5000) })), async (c) =>
    c.json(await importProspects(c.env.DB, c.req.valid("json").prospects)),
  )
  .get("/extra-fields", async (c) => {
    const rows = await all<{ key: string }>(c.env.DB, "SELECT DISTINCT j.key AS key FROM prospects p, json_each(p.extra) j ORDER BY j.key");
    return c.json({ fields: rows.map((r) => r.key) });
  })
  .get("/tags", async (c) => {
    const rows = await all<{ tag: string }>(c.env.DB, "SELECT DISTINCT trim(j.value) AS tag FROM prospects p, json_each(p.tags) j WHERE trim(j.value) != ''");
    return c.json({ tags: rows.map((r) => r.tag).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })) });
  })
  .get("/stats", async (c) => {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const row = await first<{ total: number; contacted: number; month: number }>(
      c.env.DB,
      `SELECT COUNT(*) AS total,
              COUNT(last_touched_at) AS contacted,
              SUM(CASE WHEN last_touched_at >= ? THEN 1 ELSE 0 END) AS month
       FROM prospects`,
      [monthStart.toISOString()],
    );
    return c.json({ total_prospected: row?.total ?? 0, contacted: row?.contacted ?? 0, contacted_this_month: row?.month ?? 0 });
  })
  .patch(
    "/bulk",
    zJson(
      z.object({
        prospect_ids: idList,
        add_tags: z.array(z.string().max(255)).optional(),
        remove_tags: z.array(z.string().max(255)).optional(),
        // null unassigns; leaving it out keeps each lead's assignee.
        assigned_user_id: z.string().max(64).nullable().optional(),
        status: z.enum(PROSPECT_STATUSES).nullish(),
      }),
    ),
    async (c) => {
      const db = c.env.DB;
      const body = c.req.valid("json");
      const addTags = normalizeTags(body.add_tags ?? []);
      const removeTags = new Set(normalizeTags(body.remove_tags ?? []).map((t) => t.toLowerCase()));
      if (!addTags.length && !removeTags.size && body.assigned_user_id === undefined && !body.status) {
        throw new ApiError(422, "Provide at least one bulk update");
      }
      await assertUserExists(db, body.assigned_user_id);
      const now = nowIso();
      const statements: D1PreparedStatement[] = [];
      let updated = 0;
      for (const ids of chunk([...new Set(body.prospect_ids)], IN_CHUNK)) {
        const rows = await all<{ id: string; tags: string }>(db, `SELECT id, tags FROM prospects WHERE id IN (${placeholders(ids.length)})`, ids);
        updated += rows.length;
        for (const row of rows) {
          const columns: Record<string, string | null> = {};
          if (addTags.length || removeTags.size) {
            const tags = normalizeTags(parseJson<string[]>(row.tags, [])).filter((t) => !removeTags.has(t.toLowerCase()));
            const lower = new Set(tags.map((t) => t.toLowerCase()));
            for (const tag of addTags) if (!lower.has(tag.toLowerCase())) tags.push(tag);
            columns.tags = JSON.stringify(tags);
          }
          if (body.assigned_user_id !== undefined) columns.assigned_user_id = body.assigned_user_id;
          if (body.status) columns.status = body.status;
          const entries = Object.entries(columns);
          statements.push(
            db.prepare(`UPDATE prospects SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).bind(...entries.map(([, v]) => v), now, row.id),
          );
        }
      }
      await batch(db, statements, 100);
      return c.json({ updated });
    },
  )
  .post("/bulk-delete", zJson(z.object({ prospect_ids: idList })), async (c) => {
    const db = c.env.DB;
    let deleted = 0;
    for (const ids of chunk([...new Set(c.req.valid("json").prospect_ids)], IN_CHUNK)) {
      const list = placeholders(ids.length);
      deleted += await run(db, `DELETE FROM prospects WHERE id IN (${list})`, ids);
    }
    return c.json({ deleted });
  })
  .post("/search", zJson(searchSchema), async (c) => {
    const body = c.req.valid("json");
    const { where, params } = prospectWhere(body);
    const db = c.env.DB;
    const [rows, count] = await db.batch([
      stmt(db, `${PROSPECT_SELECT} ${where} ORDER BY p.created_at DESC, p.id LIMIT ? OFFSET ?`, [...params, body.limit, body.offset]),
      stmt(db, `SELECT COUNT(*) AS n FROM prospects p LEFT JOIN users u ON u.id = p.assigned_user_id ${where}`, params),
    ]);
    return c.json({
      prospects: (rows!.results as ProspectRow[]).map(toProspect),
      total: (count!.results[0] as { n: number } | undefined)?.n ?? 0,
      limit: body.limit,
      offset: body.offset,
    });
  })
  .post(
    "/tasks/search",
    zJson(z.object({ assigned_user_id: z.string().min(1).max(64), limit: z.number().int().min(1).max(500).default(100), offset: z.number().int().min(0).default(0) })),
    async (c) => {
      const db = c.env.DB;
      const body = c.req.valid("json");
      await assertUserExists(db, body.assigned_user_id);
      const where = `WHERE p.assigned_user_id = ? AND p.status IN ('interested', 'warm', 'cold') AND (p.next_touch_at IS NULL OR p.next_touch_at <= ?)`;
      const params = [body.assigned_user_id, nowIso()];
      const [rows, count] = await db.batch([
        stmt(
          db,
          `${PROSPECT_SELECT} ${where}
           ORDER BY (p.next_touch_at IS NULL),
                    CASE p.status WHEN 'interested' THEN 0 WHEN 'warm' THEN 1 ELSE 2 END,
                    p.next_touch_at,
                    p.last_touched_at,
                    p.created_at,
                    p.id
           LIMIT ? OFFSET ?`,
          [...params, body.limit, body.offset],
        ),
        stmt(db, `SELECT COUNT(*) AS n FROM prospects p ${where}`, params),
      ]);
      return c.json({
        prospects: (rows!.results as ProspectRow[]).map(toProspect),
        total: (count!.results[0] as { n: number } | undefined)?.n ?? 0,
        limit: body.limit,
        offset: body.offset,
      });
    },
  )
  .get("/:id", zParam(idParam), async (c) => c.json(await loadProspect(c.env.DB, c.req.valid("param").id)))
  .patch("/:id", zParam(idParam), zJson(prospectFieldsSchema.partial()), async (c) => {
    const db = c.env.DB;
    const id = c.req.valid("param").id;
    const body = c.req.valid("json");
    const current = await loadProspect(db, id);
    await assertUserExists(db, body.assigned_user_id);
    const columns = normalizeProspectFields(body, current.extra);
    if (!Object.keys(columns).length) return c.json(current);
    if (columns.phone && columns.phone !== current.phone && (await first(db, "SELECT id FROM prospects WHERE phone = ?", [columns.phone]))) {
      throw new ApiError(409, "Another prospect already has this phone number");
    }
    await updateProspect(db, id, columns).run();
    return c.json(await loadProspect(db, id));
  })
  .delete("/:id", zParam(idParam), async (c) => {
    const db = c.env.DB;
    const id = c.req.valid("param").id;
    await loadProspect(db, id);
    await run(db, "DELETE FROM prospects WHERE id = ?", [id]);
    return c.json({ ok: true });
  })
  .get("/:id/touches", zParam(idParam), async (c) => {
    const id = c.req.valid("param").id;
    await loadProspect(c.env.DB, id);
    return c.json({ touches: await all<TouchRow>(c.env.DB, `${TOUCH_SELECT} WHERE t.prospect_id = ? ORDER BY t.occurred_at DESC`, [id]) });
  })
  .post("/:id/touches", zParam(idParam), zJson(touchSchema), async (c) => {
    const db = c.env.DB;
    const prospectId = c.req.valid("param").id;
    await loadProspect(db, prospectId);
    const body = c.req.valid("json");
    const touchId = newId();
    await db.batch([
      db
        .prepare("INSERT INTO prospect_touches (id, prospect_id, touching_user_id, kind, occurred_at, summary, call_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(touchId, prospectId, c.get("user").id, body.kind, body.occurred_at, body.summary?.trim() || null, normalizeCallStatus(body.call_status), nowIso()),
      refreshLastTouch(db, prospectId),
    ]);
    return c.json((await first<TouchRow>(db, `${TOUCH_SELECT} WHERE t.id = ?`, [touchId]))!, 201);
  })
  .patch(
    "/:id/touches/:touchId",
    zParam(z.object({ id: z.string().min(1).max(64), touchId: z.string().min(1).max(64) })),
    zJson(touchSchema.partial()),
    async (c) => {
      const db = c.env.DB;
      const { id, touchId } = c.req.valid("param");
      const body = c.req.valid("json");
      if (!(await first(db, "SELECT id FROM prospect_touches WHERE id = ? AND prospect_id = ?", [touchId, id]))) throw new ApiError(404, "Touch not found");
      const columns: Record<string, string | null> = {};
      if (body.kind) columns.kind = body.kind;
      if (body.occurred_at) columns.occurred_at = body.occurred_at;
      if (body.summary !== undefined) columns.summary = body.summary?.trim() || null;
      if (body.call_status !== undefined) columns.call_status = normalizeCallStatus(body.call_status);
      const entries = Object.entries(columns);
      if (!entries.length) throw new ApiError(400, "No fields to update");
      await db.batch([
        db.prepare(`UPDATE prospect_touches SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).bind(...entries.map(([, v]) => v), nowIso(), touchId),
        refreshLastTouch(db, id),
      ]);
      return c.json((await first<TouchRow>(db, `${TOUCH_SELECT} WHERE t.id = ?`, [touchId]))!);
    },
  )
  .post("/:id/task-action", zParam(idParam), zJson(taskActionSchema), async (c) => {
    const db = c.env.DB;
    const id = c.req.valid("param").id;
    await loadProspect(db, id);
    const body = c.req.valid("json");
    const touchId = newId();
    const now = nowIso();
    const columns: ProspectColumns = {};
    if (body.status) columns.status = body.status;
    if (body.next_touch_at !== undefined) columns.next_touch_at = body.next_touch_at;
    await db.batch([
      db
        .prepare("INSERT INTO prospect_touches (id, prospect_id, touching_user_id, kind, occurred_at, summary, call_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(touchId, id, c.get("user").id, body.kind, now, body.summary?.trim() || null, normalizeCallStatus(body.call_status), now),
      updateProspect(db, id, columns),
      refreshLastTouch(db, id),
    ]);
    return c.json({ prospect: await loadProspect(db, id), touch: (await first<TouchRow>(db, `${TOUCH_SELECT} WHERE t.id = ?`, [touchId]))! });
  });


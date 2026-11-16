import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { first, likeContains, nowIso, parseJson, type Db } from "../db";
import { ApiError } from "../http";
import type { ProspectColumns, ProspectStatus } from "./fields";

export type ProspectRow = {
  id: string;
  created_at: string;
  updated_at: string | null;
  phone: string;
  email: string | null;
  name: string | null;
  tags: string;
  title: string | null;
  company: string | null;
  notes: string | null;
  assigned_user_id: string | null;
  status: ProspectStatus;
  next_touch_at: string | null;
  extra: string;
  last_touched_at: string | null;
  last_touch_kind: string | null;
  last_touch_summary: string | null;
  assigned_user_username: string | null;
};

export type Prospect = Omit<ProspectRow, "tags" | "extra"> & { tags: string[]; extra: Record<string, unknown> };

export const PROSPECT_SELECT = `SELECT p.*, u.username AS assigned_user_username FROM prospects p LEFT JOIN users u ON u.id = p.assigned_user_id`;

export const toProspect = (row: ProspectRow): Prospect => ({
  ...row,
  tags: parseJson<string[]>(row.tags, []),
  extra: parseJson<Record<string, unknown>>(row.extra, {}),
});

export async function loadProspect(db: Db, id: string): Promise<Prospect> {
  const row = await first<ProspectRow>(db, `${PROSPECT_SELECT} WHERE p.id = ?`, [id]);
  if (!row) throw new ApiError(404, "Prospect not found");
  return toProspect(row);
}

export async function assertUserExists(db: Db, id: string | null | undefined): Promise<void> {
  if (id && !(await first(db, "SELECT id FROM users WHERE id = ?", [id]))) throw new ApiError(400, "Assigned user not found");
}

export function insertProspect(db: Db, id: string, columns: ProspectColumns, createdAt = nowIso()): D1PreparedStatement {
  const entries = Object.entries(columns);
  const names = ["id", "created_at", ...entries.map(([k]) => k)];
  return db
    .prepare(`INSERT INTO prospects (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`)
    .bind(id, createdAt, ...entries.map(([, v]) => v ?? null));
}

export function updateProspect(db: Db, id: string, columns: ProspectColumns): D1PreparedStatement {
  const entries = Object.entries(columns);
  const sets = [...entries.map(([k]) => `${k} = ?`), "updated_at = ?"];
  return db.prepare(`UPDATE prospects SET ${sets.join(", ")} WHERE id = ?`).bind(...entries.map(([, v]) => v ?? null), nowIso(), id);
}

/** Copies the latest touch onto the prospect row (or clears it when there are none). */
export function refreshLastTouch(db: Db, prospectId: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE prospects SET (last_touched_at, last_touch_kind, last_touch_summary) =
         (SELECT occurred_at, kind, summary FROM prospect_touches WHERE prospect_id = ?1 ORDER BY occurred_at DESC, created_at DESC LIMIT 1),
       updated_at = ?2
       WHERE id = ?1`,
    )
    .bind(prospectId, nowIso());
}

export const FIELD_FILTER_FIELD = /^(email|name|company|title|phone|tags|assigned_user|status|extra\.[A-Za-z0-9_-]+)$/;
export const FIELD_FILTER_OPERATORS = ["contains", "not_contains", "empty", "not_empty"] as const;

export type ProspectFilters = {
  search?: string | null;
  status?: ProspectStatus | null;
  field_filters?: { field: string; operator: (typeof FIELD_FILTER_OPERATORS)[number]; value?: string | null }[];
  last_touched_before?: string | null;
  last_touched_after?: string | null;
  touched?: boolean | null;
  touch_kind?: string | null;
  assigned_user_id?: string | null;
};

const COLUMN: Record<string, string> = {
  email: "p.email",
  name: "p.name",
  company: "p.company",
  title: "p.title",
  phone: "p.phone",
  tags: "p.tags",
  status: "p.status",
};

/** WHERE clause and parameters for the prospect search filters. */
export function prospectWhere(filters: ProspectFilters): { where: string; params: (string | number | null)[] } {
  const clauses: string[] = [];
  const params: (string | number | null)[] = [];
  const search = filters.search?.trim();
  if (search) {
    const fields = ["p.email", "p.name", "p.company", "p.title", "p.phone", "u.username", "p.tags"];
    clauses.push(`(${fields.map((f) => `${f} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    params.push(...fields.map(() => likeContains(search)));
  }
  if (filters.status) {
    clauses.push("p.status = ?");
    params.push(filters.status);
  }
  if (filters.assigned_user_id) {
    clauses.push("p.assigned_user_id = ?");
    params.push(filters.assigned_user_id);
  }
  for (const filter of filters.field_filters ?? []) {
    const value = filter.value?.trim() ?? "";
    if (filter.field === "assigned_user") {
      if (filter.operator === "empty") clauses.push("p.assigned_user_id IS NULL");
      else if (filter.operator === "not_empty") clauses.push("p.assigned_user_id IS NOT NULL");
      else if (value && filter.operator === "contains") {
        clauses.push("p.assigned_user_id = ?");
        params.push(value);
      } else if (value) {
        clauses.push("(p.assigned_user_id IS NULL OR p.assigned_user_id != ?)");
        params.push(value);
      }
      continue;
    }
    let column = COLUMN[filter.field];
    const columnParams: string[] = [];
    if (!column) {
      column = "json_extract(p.extra, ?)";
      columnParams.push(`$."${filter.field.slice("extra.".length)}"`);
    }
    const isTags = filter.field === "tags";
    if (filter.operator === "empty") {
      clauses.push(isTags ? "(p.tags IS NULL OR p.tags = '[]')" : `(${column} IS NULL OR ${column} = '')`);
      if (!isTags) params.push(...columnParams, ...columnParams);
    } else if (filter.operator === "not_empty") {
      clauses.push(isTags ? "(p.tags IS NOT NULL AND p.tags != '[]')" : `(${column} IS NOT NULL AND ${column} != '')`);
      if (!isTags) params.push(...columnParams, ...columnParams);
    } else if (value && filter.operator === "contains") {
      clauses.push(`${column} LIKE ? ESCAPE '\\'`);
      params.push(...columnParams, likeContains(value));
    } else if (value) {
      clauses.push(`(${column} IS NULL OR ${column} NOT LIKE ? ESCAPE '\\')`);
      params.push(...columnParams, ...columnParams, likeContains(value));
    }
  }
  if (filters.touch_kind) {
    clauses.push("p.last_touch_kind = ?");
    params.push(filters.touch_kind);
  }
  if (filters.last_touched_before) {
    clauses.push("p.last_touched_at < ?");
    params.push(filters.last_touched_before);
  }
  if (filters.last_touched_after) {
    clauses.push("p.last_touched_at >= ?");
    params.push(filters.last_touched_after);
  }
  if (filters.touched === true) clauses.push("p.last_touched_at IS NOT NULL");
  if (filters.touched === false) clauses.push("p.last_touched_at IS NULL");
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

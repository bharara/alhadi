import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { all, batch, chunk, IN_CHUNK, newId, nowIso, parseJson, placeholders, type Db } from "../db";
import { ApiError } from "../http";
import { normalizeProspectFields, type ProspectColumns, type ProspectFieldsInput } from "./fields";
import { insertProspect, updateProspect } from "./store";

type Existing = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  status: string;
  extra: string;
  assigned_user_username: string | null;
};

export type ImportResult = {
  created: number;
  updated: number;
  errors: { index: number; detail: string }[];
  existing: {
    index: number;
    matched_by: ("email" | "phone")[];
    prospect_id: string;
    name: string | null;
    phone: string;
    email: string | null;
    status: string;
    assigned_user_username: string | null;
  }[];
};

/**
 * Creates new prospects and fills in existing ones matched by email or phone.
 * Updates only overwrite the fields a row actually has a value for.
 */
export async function importProspects(db: Db, rows: ProspectFieldsInput[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, errors: [], existing: [] };
  const normalized: (ProspectColumns | null)[] = rows.map((row, index) => {
    if (!row.phone?.trim()) {
      result.errors.push({ index, detail: "Missing phone" });
      return null;
    }
    try {
      return normalizeProspectFields(withoutBlanks(row));
    } catch (error) {
      result.errors.push({ index, detail: error instanceof ApiError ? error.message : "Invalid row" });
      return null;
    }
  });

  const userIds = new Set((await all<{ id: string }>(db, "SELECT id FROM users")).map((u) => u.id));
  const emails = [...new Set(normalized.map((r) => r?.email).filter((e): e is string => Boolean(e)))];
  const phones = [...new Set(normalized.map((r) => r?.phone).filter((p): p is string => Boolean(p)))];
  const byEmail = new Map<string, Existing>();
  const byPhone = new Map<string, Existing>();
  const select = `SELECT p.id, p.name, p.phone, p.email, p.status, p.extra, u.username AS assigned_user_username
                  FROM prospects p LEFT JOIN users u ON u.id = p.assigned_user_id`;
  for (const part of chunk(emails, IN_CHUNK)) {
    for (const row of await all<Existing>(db, `${select} WHERE p.email IN (${placeholders(part.length)})`, part)) if (row.email) byEmail.set(row.email, row);
  }
  for (const part of chunk(phones, IN_CHUNK)) {
    for (const row of await all<Existing>(db, `${select} WHERE p.phone IN (${placeholders(part.length)})`, part)) byPhone.set(row.phone, row);
  }

  const creates: ProspectColumns[] = [];
  const createIndexByEmail = new Map<string, number>();
  const createIndexByPhone = new Map<string, number>();
  const statements: D1PreparedStatement[] = [];

  normalized.forEach((columns, index) => {
    if (!columns) return;
    if (columns.assigned_user_id && !userIds.has(columns.assigned_user_id)) {
      result.errors.push({ index, detail: "Assigned user not found" });
      return;
    }
    const emailMatch = columns.email ? byEmail.get(columns.email) : undefined;
    const phoneMatch = byPhone.get(columns.phone!);
    if (emailMatch && phoneMatch && emailMatch.id !== phoneMatch.id) {
      result.errors.push({ index, detail: "Email and phone match different existing prospects" });
      return;
    }
    const existing = emailMatch ?? phoneMatch;
    if (!existing) {
      // A later row for the same person replaces the earlier one in this batch.
      const duplicate = (columns.email ? createIndexByEmail.get(columns.email) : undefined) ?? createIndexByPhone.get(columns.phone!);
      if (duplicate !== undefined) {
        creates[duplicate] = columns;
      } else {
        creates.push(columns);
        result.created += 1;
        const at = creates.length - 1;
        if (columns.email) createIndexByEmail.set(columns.email, at);
        createIndexByPhone.set(columns.phone!, at);
      }
      return;
    }
    result.existing.push({
      index,
      matched_by: [...(emailMatch ? (["email"] as const) : []), ...(phoneMatch ? (["phone"] as const) : [])],
      prospect_id: existing.id,
      name: existing.name,
      phone: existing.phone,
      email: existing.email,
      status: existing.status,
      assigned_user_username: existing.assigned_user_username,
    });
    const update = { ...columns };
    // Keep the matched record's phone when it was matched by email; secondaries still merge into its extra.
    if (!phoneMatch) delete update.phone;
    if (update.extra) update.extra = JSON.stringify({ ...parseJson(existing.extra, {}), ...parseJson(update.extra, {}) });
    statements.push(updateProspect(db, existing.id, update));
    result.updated += 1;
  });

  const now = nowIso();
  for (const columns of creates) statements.push(insertProspect(db, newId(), columns, now));
  await batch(db, statements, 50);
  return result;
}

/** Import rows only carry the values a CSV cell actually had. */
function withoutBlanks(row: ProspectFieldsInput): ProspectFieldsInput {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    out[key] = value;
  }
  return out as ProspectFieldsInput;
}

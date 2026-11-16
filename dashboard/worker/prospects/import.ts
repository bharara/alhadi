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

// New rows are created; rows matching a prospect by email or phone fill in only the values they have.
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
      const byEmail = columns.email ? createIndexByEmail.get(columns.email) : undefined;
      const byPhone = createIndexByPhone.get(columns.phone!);
      if (byEmail !== undefined && byPhone !== undefined && byEmail !== byPhone) {
        result.errors.push({ index, detail: "Email and phone match different rows in this file" });
        return;
      }
      const at = byEmail ?? byPhone ?? creates.length;
      if (at === creates.length) result.created += 1;
      creates[at] = columns;
      if (columns.email) createIndexByEmail.set(columns.email, at);
      createIndexByPhone.set(columns.phone!, at);
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
    // New custom fields and secondary phones merge into the stored extra; an email match keeps its phone.
    const row = withoutBlanks(rows[index]!);
    const update = normalizeProspectFields({ ...row, extra: { ...parseJson(existing.extra, {}), ...(row.extra ?? {}) } });
    if (!phoneMatch) delete update.phone;
    statements.push(updateProspect(db, existing.id, update));
    result.updated += 1;
  });

  const now = nowIso();
  for (const columns of creates) statements.push(insertProspect(db, newId(), columns, now));
  await batch(db, statements, 50);
  return result;
}

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

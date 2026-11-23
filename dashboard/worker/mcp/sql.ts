import type { Db } from "../db";
import { ApiError } from "../http";

export const MAX_ROWS = 200;

// Credentials and sign-in records. `team_members` is the safe view of users.
const BLOCKED = /\b(users|user_invites|password_links|login_failures|password_hash|token)\b/i;

// D1 has no read-only connection; as a subquery, only SELECT (or WITH … SELECT) parses.
export async function runReadOnlySql(db: Db, query: string, params: (string | number | boolean | null)[]) {
  const body = query.trim().replace(/;\s*$/, "");
  if (body.includes(";")) throw new ApiError(422, "Send one statement, without semicolons");
  const blocked = body.match(BLOCKED);
  if (blocked) throw new ApiError(422, `"${blocked[1]}" is not available to this tool. Use the team_members view for users.`);
  try {
    const { results } = await db
      .prepare(`SELECT * FROM (\n${body}\n) LIMIT ${MAX_ROWS + 1}`)
      .bind(...params.map((p) => (typeof p === "boolean" ? Number(p) : p)))
      .all<Record<string, unknown>>();
    return { rows: results.slice(0, MAX_ROWS), row_count: Math.min(results.length, MAX_ROWS), truncated: results.length > MAX_ROWS };
  } catch (error) {
    throw new ApiError(422, error instanceof Error ? error.message : "Query failed");
  }
}

/** Tables and views the SQL tool can read, with their columns. */
export async function describeSchema(db: Db) {
  const { results } = await db
    .prepare("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name")
    .all<{ name: string; type: string; sql: string }>();
  return results.filter((t) => !BLOCKED.test(t.name)).map((t) => ({ name: t.name, type: t.type, definition: t.sql }));
}

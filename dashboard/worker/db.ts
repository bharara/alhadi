import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

export type Db = D1Database;
type Param = string | number | null;

export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

export function stmt(db: Db, sql: string, params: Param[] = []): D1PreparedStatement {
  return db.prepare(sql).bind(...params);
}

export async function all<T>(db: Db, sql: string, params: Param[] = []): Promise<T[]> {
  return (await stmt(db, sql, params).all<T>()).results;
}

export async function first<T>(db: Db, sql: string, params: Param[] = []): Promise<T | null> {
  return (await stmt(db, sql, params).first<T>()) ?? null;
}

export async function run(db: Db, sql: string, params: Param[] = []): Promise<number> {
  return (await stmt(db, sql, params).run()).meta.changes ?? 0;
}

/** Runs statements in atomic batches; D1 caps the size of one batch. */
export async function batch(db: Db, statements: D1PreparedStatement[], size = 50): Promise<void> {
  for (const part of chunk(statements, size)) if (part.length) await db.batch(part);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** "?, ?, ?" for an IN list. D1 binds at most 100 parameters per statement. */
export const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(", ");

export const IN_CHUNK = 90;

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Escapes LIKE wildcards; use with ESCAPE '\'. */
export const likeContains = (value: string) => `%${value.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

const SETTING_UPSERT = "INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at";

export async function readSetting<T>(db: Db, key: string): Promise<T | null> {
  const row = await first<{ value: string }>(db, "SELECT value FROM site_settings WHERE key = ?", [key]);
  return row ? parseJson<T | null>(row.value, null) : null;
}

export async function writeSetting(db: Db, key: string, value: unknown): Promise<void> {
  await run(db, SETTING_UPSERT, [key, JSON.stringify(value), nowIso()]);
}

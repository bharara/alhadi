import { nowIso, writeSetting, type Db } from "../db";
import type { Env } from "../env";
import { googleAccessToken, parseServiceAccount } from "./google";

const API = "https://www.googleapis.com/webmasters/v3/sites";
const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];
const MAX_ROWS = 25_000;
const DAY_MS = 86_400_000;
export const LAST_SYNC_KEY = "gsc_last_sync";

type ApiRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export function searchConsoleConfigured(env: Env): boolean {
  return Boolean(env.GSC_SERVICE_ACCOUNT_JSON && env.GSC_PROPERTY);
}

/** The last `days` days ending yesterday. Fresh days are re-synced later, as Google keeps filling them in. */
export function recentRange(days: number): { start: string; end: string } {
  const end = new Date(Date.now() - DAY_MS);
  return { start: isoDay(new Date(end.getTime() - (days - 1) * DAY_MS)), end: isoDay(end) };
}

export async function syncSearchConsole(env: Env, start: string, end: string): Promise<{ days: number; rows: number }> {
  if (!searchConsoleConfigured(env)) throw new Error("Search Console is not configured");
  const token = await googleAccessToken(parseServiceAccount(env.GSC_SERVICE_ACCOUNT_JSON!), SCOPES);
  const query = (body: Record<string, unknown>) => searchAnalytics(token, env.GSC_PROPERTY, { startDate: start, endDate: end, dataState: "all", ...body });

  const daily = await query({ dimensions: ["date"], rowLimit: MAX_ROWS });
  const rows: ApiRow[] = [];
  for (;;) {
    const page = await query({ dimensions: ["date", "page", "query"], rowLimit: MAX_ROWS, startRow: rows.length });
    rows.push(...page);
    if (page.length < MAX_ROWS) break;
  }

  // One atomic batch per day, so a failure never leaves a day half-replaced.
  const db: Db = env.DB;
  const rowsByDay = Map.groupBy(rows, (r) => r.keys[0]!);
  for (const day of daily) {
    const date = day.keys[0]!;
    await db.batch([
      db.prepare("DELETE FROM gsc_daily WHERE date = ?").bind(date),
      db.prepare("DELETE FROM gsc_rows WHERE date = ?").bind(date),
      db.prepare("INSERT INTO gsc_daily (date, clicks, impressions, position) VALUES (?, ?, ?, ?)").bind(date, day.clicks, day.impressions, day.position),
      ...(rowsByDay.get(date) ?? []).map((r) =>
        db.prepare("INSERT OR REPLACE INTO gsc_rows (date, page, query, clicks, impressions, position) VALUES (?, ?, ?, ?, ?, ?)").bind(date, r.keys[1]!, r.keys[2]!, r.clicks, r.impressions, r.position),
      ),
    ]);
  }
  await writeSetting(db, LAST_SYNC_KEY, { at: nowIso(), start, end });
  return { days: daily.length, rows: rows.length };
}

async function searchAnalytics(token: string, property: string, body: Record<string, unknown>): Promise<ApiRow[]> {
  const response = await fetch(`${API}/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Search Console query failed (${response.status}): ${await response.text()}`);
  return ((await response.json()) as { rows?: ApiRow[] }).rows ?? [];
}

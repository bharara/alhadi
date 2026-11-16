import { Hono } from "hono";
import { z } from "zod";
import { requireAdmin } from "../auth/middleware";
import { all, first, nowIso, run } from "../db";
import type { AuthedEnv } from "../env";
import { ApiError } from "../http";
import { isoDate, zJson, zQuery } from "../validation";
import { isoDay, recentRange, searchConsoleConfigured, syncSearchConsole } from "./sync";

const DAY_MS = 86_400_000;
const MAX_SYNC_DAYS = 93;
const LAST_SYNC_KEY = "gsc_last_sync";

type Totals = { clicks: number; impressions: number; ctr: number | null; position: number | null };
type Aggregate = { key: string; clicks: number; impressions: number; position: number };

const toTotals = (row: { clicks: number | null; impressions: number | null; weighted: number | null } | null): Totals => {
  const clicks = row?.clicks ?? 0;
  const impressions = row?.impressions ?? 0;
  return { clicks, impressions, ctr: impressions ? clicks / impressions : null, position: impressions && row?.weighted != null ? row.weighted / impressions : null };
};

export const analyticsRoutes = new Hono<AuthedEnv>()
  .get("/search", zQuery(z.object({ days: z.enum(["7", "28", "90", "180", "365"]).default("28") })), async (c) => {
    const db = c.env.DB;
    const days = Number(c.req.valid("query").days);
    const lastSync = await first<{ value: string }>(db, "SELECT value FROM site_settings WHERE key = ?", [LAST_SYNC_KEY]);
    const latest = await first<{ date: string | null }>(db, "SELECT MAX(date) AS date FROM gsc_daily");
    const base = { configured: searchConsoleConfigured(c.env), property: c.env.GSC_PROPERTY, last_sync: lastSync ? (JSON.parse(lastSync.value) as { at: string; start: string; end: string }) : null };
    if (!latest?.date) return c.json({ ...base, range: null, totals: null, previous: null, daily: [], top_queries: [], top_pages: [], striking: [] });

    const end = new Date(`${latest.date}T00:00:00.000Z`);
    const start = isoDay(new Date(end.getTime() - (days - 1) * DAY_MS));
    const prevEnd = isoDay(new Date(end.getTime() - days * DAY_MS));
    const prevStart = isoDay(new Date(end.getTime() - (2 * days - 1) * DAY_MS));
    const totalsSql = "SELECT SUM(clicks) AS clicks, SUM(impressions) AS impressions, SUM(position * impressions) AS weighted FROM gsc_daily WHERE date BETWEEN ? AND ?";
    const aggregate = (column: "query" | "page", extra = "", limit = 100) =>
      all<Aggregate>(
        db,
        `SELECT ${column} AS key, SUM(clicks) AS clicks, SUM(impressions) AS impressions, SUM(position * impressions) / SUM(impressions) AS position
         FROM gsc_rows WHERE date BETWEEN ? AND ? GROUP BY ${column} ${extra}
         ORDER BY ${extra ? "impressions DESC" : "clicks DESC, impressions DESC"} LIMIT ${limit}`,
        [start, latest.date!],
      );

    const [current, previous, daily, topQueries, topPages, striking] = await Promise.all([
      first<{ clicks: number; impressions: number; weighted: number }>(db, totalsSql, [start, latest.date]),
      first<{ clicks: number; impressions: number; weighted: number }>(db, totalsSql, [prevStart, prevEnd]),
      all<{ date: string; clicks: number; impressions: number; position: number }>(db, "SELECT date, clicks, impressions, position FROM gsc_daily WHERE date BETWEEN ? AND ? ORDER BY date", [start, latest.date]),
      aggregate("query"),
      aggregate("page"),
      aggregate("query", "HAVING position >= 8 AND position <= 20", 50),
    ]);
    const withCtr = (rows: Aggregate[]) => rows.map((r) => ({ ...r, ctr: r.impressions ? r.clicks / r.impressions : 0 }));
    return c.json({
      ...base,
      range: { start, end: latest.date, previous_start: prevStart, previous_end: prevEnd },
      totals: toTotals(current),
      previous: toTotals(previous),
      daily: daily.map((d) => ({ ...d, ctr: d.impressions ? d.clicks / d.impressions : 0 })),
      top_queries: withCtr(topQueries),
      top_pages: withCtr(topPages),
      striking: withCtr(striking),
    });
  })
  .post("/sync", requireAdmin, zJson(z.object({ start: isoDate.optional(), end: isoDate.optional() })), async (c) => {
    if (!searchConsoleConfigured(c.env)) throw new ApiError(400, "Search Console is not configured. Add the GSC_SERVICE_ACCOUNT_JSON secret first.");
    const body = c.req.valid("json");
    const range = body.start && body.end ? { start: body.start, end: body.end } : recentRange(5);
    const span = (Date.parse(range.end) - Date.parse(range.start)) / DAY_MS + 1;
    if (span < 1 || span > MAX_SYNC_DAYS) throw new ApiError(422, `Sync between 1 and ${MAX_SYNC_DAYS} days at a time`);
    try {
      const result = await syncSearchConsole(c.env, range.start, range.end);
      await recordSync(c.env.DB, range);
      return c.json({ ...range, ...result });
    } catch (error) {
      throw new ApiError(502, (error as Error).message);
    }
  });

export async function recordSync(db: AuthedEnv["Bindings"]["DB"], range: { start: string; end: string }): Promise<void> {
  await run(db, "INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [
    LAST_SYNC_KEY,
    JSON.stringify({ at: nowIso(), ...range }),
    nowIso(),
  ]);
}

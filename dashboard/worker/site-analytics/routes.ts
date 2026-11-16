import { Hono } from "hono";
import { z } from "zod";
import { all, first, type Db } from "../db";
import type { AuthedEnv } from "../env";
import { pktDay } from "../time";
import { zQuery } from "../validation";
import type { Channel } from "./fields";

const DAY_MS = 86_400_000;
const ENQUIRY = "kind IN ('whatsapp', 'call', 'form')";

type Totals = { visitors: number; sessions: number; pageviews: number; enquiries: number; converting_sessions: number };
type Breakdown = { key: string | null; sessions: number; enquiries: number; converting_sessions: number };

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

const TOTALS = `SELECT COUNT(DISTINCT visitor) AS visitors, COUNT(DISTINCT session) AS sessions,
    SUM(kind = 'pageview') AS pageviews, SUM(${ENQUIRY}) AS enquiries,
    COUNT(DISTINCT CASE WHEN ${ENQUIRY} THEN session END) AS converting_sessions
  FROM web_events WHERE day BETWEEN ? AND ?`;

/** Sessions, enquiries and converting sessions per value of a column. */
const breakdown = (db: Db, column: string, range: [string, string], limit = 20) =>
  all<Breakdown>(
    db,
    `SELECT ${column} AS key, COUNT(DISTINCT session) AS sessions, SUM(${ENQUIRY}) AS enquiries,
       COUNT(DISTINCT CASE WHEN ${ENQUIRY} THEN session END) AS converting_sessions
     FROM web_events WHERE day BETWEEN ? AND ? GROUP BY ${column} ORDER BY sessions DESC, enquiries DESC, key LIMIT ${limit}`,
    range,
  );

const normalize = (t: Partial<Totals> | null): Totals => ({
  visitors: t?.visitors ?? 0,
  sessions: t?.sessions ?? 0,
  pageviews: t?.pageviews ?? 0,
  enquiries: t?.enquiries ?? 0,
  converting_sessions: t?.converting_sessions ?? 0,
});

export const siteAnalyticsRoutes = new Hono<AuthedEnv>().get("/", zQuery(z.object({ days: z.enum(["7", "28", "90", "365"]).default("28") })), async (c) => {
  const db = c.env.DB;
  const days = Number(c.req.valid("query").days);
  const end = pktDay();
  const start = addDays(end, -(days - 1));
  const range: [string, string] = [start, end];
  const previous: [string, string] = [addDays(start, -days), addDays(start, -1)];

  const [current, before, daily, channels, sources, campaigns, pages, properties, countries, devices, enquiryKinds] = await Promise.all([
    first<Totals>(db, TOTALS, range),
    first<Totals>(db, TOTALS, previous),
    all<{ day: string; visitors: number; pageviews: number; enquiries: number }>(
      db,
      `SELECT day, COUNT(DISTINCT visitor) AS visitors, SUM(kind = 'pageview') AS pageviews, SUM(${ENQUIRY}) AS enquiries
       FROM web_events WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day`,
      range,
    ),
    breakdown(db, "channel", range),
    breakdown(db, "source", range),
    breakdown(db, "campaign", range),
    all<{ path: string; pageviews: number; visitors: number; enquiries: number }>(
      db,
      `SELECT path, SUM(kind = 'pageview') AS pageviews, COUNT(DISTINCT visitor) AS visitors, SUM(${ENQUIRY}) AS enquiries
       FROM web_events WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY pageviews DESC, enquiries DESC, path LIMIT 25`,
      range,
    ),
    all<{ slug: string; title: string | null; property_id: string | null; pageviews: number; enquiries: number }>(
      db,
      `SELECT e.property_slug AS slug, COALESCE(i.web_title, i.size || ' ' || replace(i.type, '_', ' ')) AS title, i.id AS property_id,
              SUM(e.kind = 'pageview') AS pageviews, SUM(e.${ENQUIRY}) AS enquiries
       FROM web_events e LEFT JOIN inventory_items i ON i.slug = e.property_slug
       WHERE e.day BETWEEN ? AND ? AND e.property_slug IS NOT NULL
       GROUP BY e.property_slug ORDER BY enquiries DESC, pageviews DESC LIMIT 25`,
      range,
    ),
    breakdown(db, "country", range, 10),
    breakdown(db, "device", range, 5),
    all<{ kind: "whatsapp" | "call" | "form"; count: number }>(db, `SELECT kind, COUNT(*) AS count FROM web_events WHERE day BETWEEN ? AND ? AND ${ENQUIRY} GROUP BY kind`, range),
  ]);

  // Every day in the range appears, so quiet days chart as zero instead of disappearing.
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const series = Array.from({ length: days }, (_, i) => addDays(start, i)).map((day) => byDay.get(day) ?? { day, visitors: 0, pageviews: 0, enquiries: 0 });

  return c.json({
    range: { start, end, previous_start: previous[0], previous_end: previous[1] },
    totals: normalize(current),
    previous: normalize(before),
    daily: series,
    channels: channels as (Breakdown & { key: Channel })[],
    sources,
    campaigns: campaigns.filter((row) => row.key),
    pages,
    properties,
    countries,
    devices,
    enquiries: enquiryKinds,
  });
});

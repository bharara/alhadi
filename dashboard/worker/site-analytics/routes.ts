import { Hono } from "hono";
import { z } from "zod";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { stmt } from "../db";
import type { AuthedEnv } from "../env";
import { autoTitle, type InventoryType } from "../inventory/fields";
import { pktDay } from "../time";
import { zQuery } from "../validation";
import { ENQUIRY_KINDS, type Channel, type EventKind } from "./fields";

const DAY_MS = 86_400_000;
const isEnquiry = (column = "kind") => `${column} IN (${ENQUIRY_KINDS.map((k) => `'${k}'`).join(", ")})`;

// A visit is a browser session; conversion is the share of visits that sent at least one enquiry.
const VISITS = `COUNT(DISTINCT session) AS visits, SUM(${isEnquiry()}) AS enquiries, COUNT(DISTINCT CASE WHEN ${isEnquiry()} THEN session END) AS converting_visits`;

type Totals = { visits: number; pageviews: number; enquiries: number; converting_visits: number };
type Breakdown<K = string | null> = { key: K; visits: number; enquiries: number; converting_visits: number };
type PropertyRow = Breakdown<string> & { size: string; type: InventoryType; block: string | null; web_title: string | null; pageviews: number };

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

export const siteAnalyticsRoutes = new Hono<AuthedEnv>().get("/", zQuery(z.object({ days: z.enum(["7", "28", "90", "365"]).default("28") })), async (c) => {
  const db = c.env.DB;
  const days = Number(c.req.valid("query").days);
  const end = pktDay();
  const start = addDays(end, -(days - 1));
  const range = [start, end];
  const previous = [addDays(start, -days), addDays(start, -1)];

  const totals = (r: string[]) => stmt(db, `SELECT ${VISITS}, SUM(kind = 'pageview') AS pageviews FROM web_events WHERE day BETWEEN ? AND ?`, r);
  const breakdown = (column: string, limit: number) =>
    stmt(db, `SELECT ${column} AS key, ${VISITS} FROM web_events WHERE day BETWEEN ? AND ? GROUP BY ${column} ORDER BY visits DESC, enquiries DESC, key LIMIT ${limit}`, range);
  const queries: D1PreparedStatement[] = [
    totals(range),
    totals(previous),
    stmt(db, `SELECT day, COUNT(DISTINCT session) AS visits, SUM(kind = 'pageview') AS pageviews, SUM(${isEnquiry()}) AS enquiries FROM web_events WHERE day BETWEEN ? AND ? GROUP BY day`, range),
    breakdown("channel", 20),
    breakdown("source", 20),
    breakdown("campaign", 20),
    stmt(
      db,
      `SELECT path AS key, SUM(kind = 'pageview') AS pageviews, ${VISITS} FROM web_events WHERE day BETWEEN ? AND ?
       GROUP BY path ORDER BY pageviews DESC, enquiries DESC, key LIMIT 25`,
      range,
    ),
    stmt(
      db,
      `SELECT e.property_id AS key, i.size, i.type, i.block, i.web_title, SUM(e.kind = 'pageview') AS pageviews,
              COUNT(DISTINCT e.session) AS visits, SUM(${isEnquiry("e.kind")}) AS enquiries,
              COUNT(DISTINCT CASE WHEN ${isEnquiry("e.kind")} THEN e.session END) AS converting_visits
       FROM web_events e JOIN inventory_items i ON i.id = e.property_id
       WHERE e.day BETWEEN ? AND ? GROUP BY e.property_id ORDER BY enquiries DESC, visits DESC, key LIMIT 25`,
      range,
    ),
    breakdown("country", 10),
    breakdown("device", 5),
    stmt(db, `SELECT kind, COUNT(*) AS count FROM web_events WHERE day BETWEEN ? AND ? AND ${isEnquiry()} GROUP BY kind`, range),
  ];
  const [current, before, daily, channels, sources, campaigns, pages, properties, countries, devices, enquiries] = (await db.batch(queries)).map((r) => r.results);

  const empty: Totals = { visits: 0, pageviews: 0, enquiries: 0, converting_visits: 0 };
  const byDay = new Map((daily as { day: string; visits: number; pageviews: number; enquiries: number }[]).map((d) => [d.day, d]));

  return c.json({
    range: { start, end, previous_start: previous[0]!, previous_end: previous[1]! },
    totals: { ...empty, ...(current![0] as Partial<Totals>) },
    previous: { ...empty, ...(before![0] as Partial<Totals>) },
    // Every day appears, so quiet days chart as zero.
    daily: Array.from({ length: days }, (_, i) => addDays(start, i)).map((day) => byDay.get(day) ?? { day, visits: 0, pageviews: 0, enquiries: 0 }),
    channels: channels as Breakdown<Channel>[],
    sources: sources as Breakdown[],
    campaigns: (campaigns as Breakdown[]).filter((row) => row.key),
    pages: pages as (Breakdown<string> & { pageviews: number })[],
    properties: (properties as PropertyRow[]).map(({ size, type, block, web_title, ...row }) => ({ ...row, title: web_title || autoTitle({ size, type, block }) })),
    countries: countries as Breakdown[],
    devices: devices as Breakdown[],
    enquiries: enquiries as { kind: Exclude<EventKind, "pageview">; count: number }[],
  });
});

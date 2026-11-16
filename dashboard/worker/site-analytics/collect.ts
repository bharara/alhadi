import { Hono } from "hono";
import { z } from "zod";
import { first, readSetting, run, writeSetting, type Db } from "../db";
import type { WorkerEnv } from "../env";
import { pktDay } from "../time";
import { browser, classify, device, isBot } from "./classify";
import { EVENT_KINDS } from "./fields";

// Sent by landing/src/components/Tracker.astro with navigator.sendBeacon (text/plain JSON).
const eventSchema = z.object({
  kind: z.enum(EVENT_KINDS),
  path: z.string().min(1).max(500),
  session: z.string().min(8).max(64),
  referrer: z.string().max(1000).nullish(),
  utm: z.object({ source: z.string().max(100).nullish(), medium: z.string().max(100).nullish(), campaign: z.string().max(200).nullish() }).nullish(),
  property: z.string().max(120).nullish(),
  width: z.number().int().min(0).max(10000).nullish(),
});

const SALT_KEY = "analytics_salt";
const encoder = new TextEncoder();
let saltCache: { day: string; salt: string } | null = null;

// A random salt per day, overwritten the next day, so a visitor hash can't be linked to an IP or across days.
async function dailySalt(db: Db, day: string): Promise<string> {
  if (saltCache?.day === day) return saltCache.salt;
  const stored = await readSetting<{ day: string; salt: string }>(db, SALT_KEY);
  if (stored?.day === day) return (saltCache = stored).salt;
  const fresh = { day, salt: crypto.randomUUID() };
  await writeSetting(db, SALT_KEY, fresh);
  return (saltCache = fresh).salt;
}

async function visitorId(salt: string, ip: string, userAgent: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${salt}|${ip}|${userAgent}`));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const hostOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

export const collectRoutes = new Hono<WorkerEnv>().post("/e", async (c) => {
  const env = c.env;
  const site = new URL(env.PUBLIC_SITE_URL).hostname;
  const userAgent = c.req.header("User-Agent") ?? "";
  const ip = c.req.header("CF-Connecting-IP") ?? "";
  // Browsers send Origin on these POSTs; anything else isn't the site's tracker.
  if (hostOf(c.req.header("Origin")) !== site || isBot(userAgent)) return c.body(null, 204);
  if (!(await env.COLLECT_LIMIT.limit({ key: ip })).success) return c.body(null, 204);
  const parsed = eventSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.body(null, 204);
  const event = parsed.data;
  const now = new Date();
  const day = pktDay(now);
  const { channel, source } = classify(event.referrer, event.utm, site);
  const property = event.property ? await first<{ id: string }>(env.DB, "SELECT id FROM inventory_items WHERE slug = ?", [event.property]) : null;
  const cf = (c.req.raw as unknown as { cf?: { country?: string } }).cf;
  await run(
    env.DB,
    `INSERT INTO web_events (at, day, visitor, session, kind, path, property_id, channel, source, campaign, country, device, browser)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      now.toISOString(),
      day,
      await visitorId(await dailySalt(env.DB, day), ip, userAgent),
      event.session,
      event.kind,
      event.path.split(/[?#]/)[0]!,
      property?.id ?? null,
      channel,
      source,
      event.utm?.campaign ?? null,
      cf?.country ?? null,
      device(userAgent, event.width),
      browser(userAgent),
    ],
  );
  return c.body(null, 204);
});

import { Hono } from "hono";
import { z } from "zod";
import { run } from "../db";
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

const encoder = new TextEncoder();

// Cookieless visitor id: rotates daily and can't be traced back to an IP once the day is over.
async function visitorId(secret: string, day: string, ip: string, userAgent: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${day}|${secret}|${ip}|${userAgent}`));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const collectRoutes = new Hono<WorkerEnv>().post("/e", async (c) => {
  const site = new URL(c.env.PUBLIC_SITE_URL).hostname;
  const origin = c.req.header("Origin");
  const userAgent = c.req.header("User-Agent") ?? "";
  if ((origin && new URL(origin).hostname.replace(/^www\./, "") !== site) || isBot(userAgent)) return c.body(null, 204);
  const parsed = eventSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.body(null, 204);
  const event = parsed.data;
  const now = new Date();
  const day = pktDay(now);
  const { channel, source } = classify(event.referrer, event.utm, site);
  const cf = (c.req.raw as unknown as { cf?: { country?: string } }).cf;
  await run(
    c.env.DB,
    `INSERT INTO web_events (at, day, visitor, session, kind, path, property_slug, channel, source, campaign, country, device, browser)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      now.toISOString(),
      day,
      await visitorId(c.env.SESSION_SECRET, day, c.req.header("CF-Connecting-IP") ?? "", userAgent),
      event.session,
      event.kind,
      event.path.split(/[?#]/)[0]!,
      event.property ?? null,
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

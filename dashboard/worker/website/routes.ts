import { Hono } from "hono";
import { requireAdmin } from "../auth/middleware";
import type { AuthedEnv } from "../env";
import { WEBSITE_PROJECTS } from "../inventory/fields";
import { zJson } from "../validation";
import { purgePublicListings } from "./public";
import { readWebsiteSettings, websiteSettingsSchema, writeWebsiteSettings } from "./settings";

export const websiteRoutes = new Hono<AuthedEnv>()
  .get("/", async (c) => c.json({ settings: await readWebsiteSettings(c.env.DB), projects: WEBSITE_PROJECTS, site_url: c.env.PUBLIC_SITE_URL }))
  .put("/settings", requireAdmin, zJson(websiteSettingsSchema), async (c) => {
    await writeWebsiteSettings(c.env.DB, c.req.valid("json"));
    c.executionCtx.waitUntil(purgePublicListings(c.req.url));
    return c.json({ settings: await readWebsiteSettings(c.env.DB) });
  });

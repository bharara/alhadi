import { Hono } from "hono";
import { requireAdmin } from "../auth/middleware";
import type { AuthedEnv } from "../env";
import { ApiError } from "../http";
import { zJson } from "../validation";
import { WEBSITE_PROJECTS } from "../inventory/fields";
import { readRebuildState, requestSiteRebuild, triggerSiteRebuild } from "../site-build";
import { readWebsiteSettings, websiteSettingsSchema, writeWebsiteSettings } from "./settings";

export const websiteRoutes = new Hono<AuthedEnv>()
  .get("/", async (c) =>
    c.json({
      settings: await readWebsiteSettings(c.env.DB),
      projects: WEBSITE_PROJECTS,
      site_url: c.env.PUBLIC_SITE_URL,
      rebuild: await readRebuildState(c.env.DB),
    }),
  )
  .put("/settings", requireAdmin, zJson(websiteSettingsSchema), async (c) => {
    await writeWebsiteSettings(c.env.DB, c.req.valid("json"));
    await requestSiteRebuild(c.env);
    return c.json({ settings: await readWebsiteSettings(c.env.DB) });
  })
  .post("/rebuild", requireAdmin, async (c) => {
    const rebuild = await triggerSiteRebuild(c.env);
    if (rebuild.error) throw new ApiError(502, rebuild.error);
    return c.json({ rebuild });
  });

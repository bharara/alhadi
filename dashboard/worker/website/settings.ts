import { z } from "zod";
import { first, nowIso, run, type Db } from "../db";

/** What the public site shows. Stored as one JSON row in site_settings. */
export const websiteSettingsSchema = z.object({
  home_enabled: z.boolean(),
  home_heading: z.string().trim().min(1).max(120),
  home_intro: z.string().trim().max(400),
  home_limit: z.number().int().min(1).max(24),
  project_enabled: z.boolean(),
  project_heading: z.string().trim().min(1).max(120),
  show_sold: z.boolean(),
});
export type WebsiteSettings = z.infer<typeof websiteSettingsSchema>;

export const DEFAULT_WEBSITE_SETTINGS: WebsiteSettings = {
  home_enabled: true,
  home_heading: "Available now",
  home_intro: "A selection of plots on the market today. Message us on WhatsApp for the full list and current prices.",
  home_limit: 6,
  project_enabled: true,
  project_heading: "Available plots",
  show_sold: false,
};

const KEY = "website";

export async function readWebsiteSettings(db: Db): Promise<WebsiteSettings> {
  const row = await first<{ value: string }>(db, "SELECT value FROM site_settings WHERE key = ?", [KEY]);
  const parsed = websiteSettingsSchema.partial().safeParse(row ? JSON.parse(row.value) : {});
  return { ...DEFAULT_WEBSITE_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

export async function writeWebsiteSettings(db: Db, settings: WebsiteSettings): Promise<void> {
  await run(db, "INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [
    KEY,
    JSON.stringify(settings),
    nowIso(),
  ]);
}

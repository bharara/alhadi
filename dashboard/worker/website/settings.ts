import { z } from "zod";
import { readSetting, writeSetting, type Db } from "../db";

export const websiteSettingsSchema = z.object({
  home_enabled: z.boolean(),
  home_heading: z.string().trim().min(1).max(120),
  home_intro: z.string().trim().max(400),
  home_limit: z.number().int().min(1).max(24),
  project_enabled: z.boolean(),
  project_heading: z.string().trim().min(1).max(120),
  show_sold: z.boolean(),
});
type WebsiteSettings = z.infer<typeof websiteSettingsSchema>;

const DEFAULTS: WebsiteSettings = {
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
  const parsed = websiteSettingsSchema.partial().safeParse((await readSetting(db, KEY)) ?? {});
  return { ...DEFAULTS, ...(parsed.success ? parsed.data : {}) };
}

export const writeWebsiteSettings = (db: Db, settings: WebsiteSettings) => writeSetting(db, KEY, settings);

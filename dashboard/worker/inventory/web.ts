import { z } from "zod";
import { first, nowIso, type Db } from "../db";
import { ApiError } from "../http";
import { slugify, slugSchema, uniqueSlug } from "../slug";
import { optionalText } from "../validation";
import { WEBSITE_PROJECTS, WEBSITE_PROJECT_SLUGS, type InventoryType, type WebsiteProjectSlug } from "./fields";

export const webFields = {
  project_slug: z.enum(WEBSITE_PROJECT_SLUGS).nullable(),
  slug: slugSchema,
  web_title: optionalText(160),
  web_summary: optionalText(300),
  web_description: optionalText(5000),
  web_price: optionalText(120),
  web_features: z.array(z.string().trim().min(1).max(80)).max(20),
  show_number: z.boolean(),
  published: z.boolean(),
  featured: z.boolean(),
  web_order: z.number().int().min(-100000).max(100000),
};

type PublishTarget = { id: string; town: string; size: string; type: InventoryType; block: string | null; project_slug: string | null; slug: string | null; published_at: string | null };

const guessProject = (town: string): WebsiteProjectSlug | null => WEBSITE_PROJECTS.find((p) => town.toLowerCase().includes(p.town))?.slug ?? null;

/** Website columns implied by a change: publishing fills in a project, web address and date; unpublishing unfeatures. */
export async function impliedWebColumns(db: Db, item: PublishTarget, changes: { project_slug?: string | null; slug?: string; published?: boolean }) {
  const columns: Record<string, string | number | null> = {};
  if (changes.slug && changes.slug !== item.slug && (await first(db, "SELECT id FROM inventory_items WHERE slug = ? AND id != ?", [changes.slug, item.id]))) {
    throw new ApiError(409, "Another property already uses this web address");
  }
  if (changes.published === false) columns.featured = 0;
  if (!changes.published) return columns;
  const project = changes.project_slug !== undefined ? changes.project_slug : (item.project_slug ?? guessProject(item.town));
  if (changes.project_slug === undefined && !item.project_slug) columns.project_slug = project;
  if (!(changes.slug ?? item.slug)) {
    columns.slug = await uniqueSlug(db, "inventory_items", slugify(`${project ?? item.town} ${item.size} ${item.type.replace("_", " ")}${item.block ? ` block ${item.block}` : ""}`, "property"), item.id);
  }
  if (!item.published_at) columns.published_at = nowIso();
  return columns;
}

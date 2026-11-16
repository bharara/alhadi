export const INVENTORY_TYPES = ["commercial_plot", "residential_plot", "house", "apartment"] as const;
export const INVENTORY_STATUSES = ["available", "sold"] as const;
export const CONTACT_KINDS = ["direct", "indirect"] as const;

export type InventoryType = (typeof INVENTORY_TYPES)[number];

export const INVENTORY_TYPE_LABELS: Record<InventoryType, string> = {
  commercial_plot: "Commercial plot",
  residential_plot: "Residential plot",
  house: "House",
  apartment: "Apartment",
};

/** The website title a property gets when none is written, e.g. "1 Kanal residential plot in Block C". */
export function autoTitle(row: { size: string; type: InventoryType; block: string | null }): string {
  const title = `${row.size} ${INVENTORY_TYPE_LABELS[row.type].toLowerCase()}${row.block ? ` in Block ${row.block}` : ""}`;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Projects with a page on bestbuilderdeveloper.com; landing/src/data/site.ts lists the same slugs. */
export const WEBSITE_PROJECTS = [
  { slug: "sitara-villas", name: "Sitara Villas Best Block", town: "sitara villas" },
  { slug: "abdullah-gardens", name: "Abdullah Gardens", town: "abdullah gardens" },
  { slug: "city-walk", name: "City Walk", town: "city walk" },
] as const;

export type WebsiteProjectSlug = (typeof WEBSITE_PROJECTS)[number]["slug"];
export const WEBSITE_PROJECT_SLUGS = WEBSITE_PROJECTS.map((p) => p.slug) as [WebsiteProjectSlug, ...WebsiteProjectSlug[]];

export const MAX_PHOTOS = 30;

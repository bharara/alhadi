/** Shared by the Worker and the dashboard UI. */
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

/** The projects that have a page on bestbuilderdeveloper.com, by URL slug. */
export const WEBSITE_PROJECTS = [
  { slug: "sitara-villas", name: "Sitara Villas Best Block" },
  { slug: "abdullah-gardens", name: "Abdullah Gardens" },
  { slug: "city-walk", name: "City Walk" },
] as const;

export type WebsiteProjectSlug = (typeof WEBSITE_PROJECTS)[number]["slug"];
export const WEBSITE_PROJECT_SLUGS = WEBSITE_PROJECTS.map((p) => p.slug) as [WebsiteProjectSlug, ...WebsiteProjectSlug[]];

// Constants shared by the Worker and the dashboard UI; keep this file free of runtime imports.

/** Projects with a page on bestbuilderdeveloper.com; landing/src/data/site.ts lists the same slugs. */
export const WEBSITE_PROJECTS = [
  { slug: "sitara-villas", name: "Sitara Villas Best Block", town: "sitara villas" },
  { slug: "abdullah-gardens", name: "Abdullah Gardens", town: "abdullah gardens" },
  { slug: "city-walk", name: "City Walk", town: "city walk" },
] as const;

export type WebsiteProjectSlug = (typeof WEBSITE_PROJECTS)[number]["slug"];
export const WEBSITE_PROJECT_SLUGS = WEBSITE_PROJECTS.map((p) => p.slug) as [WebsiteProjectSlug, ...WebsiteProjectSlug[]];

export const MAX_PHOTOS = 30;

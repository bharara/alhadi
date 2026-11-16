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

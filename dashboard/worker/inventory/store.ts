import { first, parseJson } from "../db";
import type { Env, SessionUser } from "../env";
import { ApiError } from "../http";
import { autoTitle, type CONTACT_KINDS, type INVENTORY_STATUSES, type InventoryType, type WEBSITE_PROJECT_SLUGS } from "./fields";
import { photoUrls } from "./photo-storage";

export type ItemRow = {
  id: string;
  created_at: string;
  updated_at: string | null;
  house_number: string;
  block: string | null;
  town: string;
  type: InventoryType;
  status: (typeof INVENTORY_STATUSES)[number];
  size: string;
  details: string | null;
  asking_price: string | null;
  contact_phone_number: string;
  contact_name: string;
  contact_kind: (typeof CONTACT_KINDS)[number];
  entered_by_user_id: string;
  entered_by_username: string | null;
  project_slug: (typeof WEBSITE_PROJECT_SLUGS)[number] | null;
  slug: string | null;
  web_title: string | null;
  web_summary: string | null;
  web_description: string | null;
  web_price: string | null;
  web_features: string;
  show_number: number;
  published: number;
  featured: number;
  web_order: number;
  published_at: string | null;
  photo_count: number;
  cover_key: string | null;
};

export const SELECT = `SELECT i.*, u.username AS entered_by_username,
    (SELECT COUNT(*) FROM property_photos p WHERE p.property_id = i.id) AS photo_count,
    (SELECT p.storage_key FROM property_photos p WHERE p.property_id = i.id ORDER BY p.sort_order, p.created_at LIMIT 1) AS cover_key
  FROM inventory_items i LEFT JOIN users u ON u.id = i.entered_by_user_id`;

export function toItem(env: Env, { cover_key, ...row }: ItemRow, user: SessionUser) {
  return {
    ...row,
    web_features: parseJson<string[]>(row.web_features, []),
    show_number: Boolean(row.show_number),
    published: Boolean(row.published),
    featured: Boolean(row.featured),
    auto_title: autoTitle(row),
    cover: cover_key ? photoUrls(env, cover_key) : null,
    can_edit: user.role === "admin" || row.entered_by_user_id === user.id,
  };
}

export async function loadItem(env: Env, id: string, user: SessionUser) {
  const row = await first<ItemRow>(env.DB, `${SELECT} WHERE i.id = ?`, [id]);
  if (!row) throw new ApiError(404, "Property not found");
  return toItem(env, row, user);
}

export async function loadEditable(env: Env, id: string, user: SessionUser) {
  const item = await loadItem(env, id, user);
  if (!item.can_edit) throw new ApiError(403, "Only admins or whoever entered this property can change it");
  return item;
}


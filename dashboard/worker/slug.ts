import { z } from "zod";
import { first, type Db } from "./db";

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");

export const slugify = (value: string, fallback: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/, "") || fallback;

/** `base`, or `base-2`, `base-3`… whichever no other row of the table uses. */
export async function uniqueSlug(db: Db, table: "inventory_items" | "articles", base: string, exceptId: string): Promise<string> {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await first(db, `SELECT id FROM ${table} WHERE slug = ? AND id != ?`, [candidate, exceptId]))) return candidate;
  }
}

import { Hono } from "hono";
import { z } from "zod";
import { all, first, newId, nowIso, stmt } from "../db";
import type { AuthedEnv, Env } from "../env";
import { ApiError } from "../http";
import { requestSiteRebuild } from "../site-build";
import { idParam, optionalText, zJson, zParam } from "../validation";
import { MAX_PHOTOS } from "./fields";
import { deletePhotos, photoUrls, putPhoto } from "./photo-storage";
import { loadEditable } from "./store";

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const photoUpload = z.object({
  full: z.instanceof(File),
  thumb: z.instanceof(File),
  width: z.coerce.number().int().min(1).max(4000),
  height: z.coerce.number().int().min(1).max(4000),
  alt: optionalText(200),
});

type PhotoRow = { id: string; storage_key: string; width: number; height: number; alt: string | null; sort_order: number };

async function photosOf(env: Env, propertyId: string) {
  const rows = await all<PhotoRow>(env.DB, "SELECT id, storage_key, width, height, alt, sort_order FROM property_photos WHERE property_id = ? ORDER BY sort_order, created_at", [propertyId]);
  return rows.map(({ storage_key, ...photo }) => ({ ...photo, ...photoUrls(env, storage_key) }));
}

const isWebp = (f: File) => f.type === "image/webp" && f.size > 0 && f.size <= MAX_PHOTO_BYTES;

// Mounted at /inventory/:id/photos. The browser resizes photos to WebP before uploading (src/pages/inventory/photos.ts).
export const photoRoutes = new Hono<AuthedEnv>()
  .get("/", zParam(idParam), async (c) => c.json({ photos: await photosOf(c.env, c.req.valid("param").id) }))
  .post("/", zParam(idParam), async (c) => {
    const env = c.env;
    const item = await loadEditable(env, c.req.valid("param").id, c.get("user"));
    if (item.photo_count >= MAX_PHOTOS) throw new ApiError(400, `A property can have at most ${MAX_PHOTOS} photos`);
    const parsed = photoUpload.safeParse(Object.fromEntries((await c.req.formData()).entries()));
    if (!parsed.success || !isWebp(parsed.data.full) || !isWebp(parsed.data.thumb)) throw new ApiError(422, "Upload WebP images under 4 MB (the dashboard converts photos for you)");
    const { full, thumb, width, height, alt } = parsed.data;
    const id = newId();
    const key = `properties/${item.id}/${id}`;
    await putPhoto(env, key, await full.arrayBuffer(), await thumb.arrayBuffer());
    try {
      await stmt(
        env.DB,
        `INSERT INTO property_photos (id, property_id, storage_key, width, height, alt, sort_order, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM property_photos WHERE property_id = ?2), ?7)`,
        [id, item.id, key, width, height, alt, nowIso()],
      ).run();
    } catch (error) {
      // Photos have no lifecycle expiry, so a failed insert must not leave files behind.
      await deletePhotos(env, [key]);
      throw error;
    }
    if (item.published) await requestSiteRebuild(env);
    return c.json({ photos: await photosOf(env, item.id) }, 201);
  })
  .put("/", zParam(idParam), zJson(z.object({ order: z.array(z.string()).max(MAX_PHOTOS), alts: z.record(z.string(), z.string().max(200)).optional() })), async (c) => {
    const env = c.env;
    const item = await loadEditable(env, c.req.valid("param").id, c.get("user"));
    const { order, alts = {} } = c.req.valid("json");
    const statements = [
      ...order.map((photoId, index) => env.DB.prepare("UPDATE property_photos SET sort_order = ? WHERE id = ? AND property_id = ?").bind(index, photoId, item.id)),
      ...Object.entries(alts).map(([photoId, alt]) => env.DB.prepare("UPDATE property_photos SET alt = ? WHERE id = ? AND property_id = ?").bind(alt.trim() || null, photoId, item.id)),
    ];
    if (statements.length) await env.DB.batch(statements);
    if (item.published) await requestSiteRebuild(env);
    return c.json({ photos: await photosOf(env, item.id) });
  })
  .delete("/:photoId", zParam(idParam.extend({ photoId: z.string().min(1).max(64) })), async (c) => {
    const env = c.env;
    const { id, photoId } = c.req.valid("param");
    const item = await loadEditable(env, id, c.get("user"));
    const photo = await first<{ storage_key: string }>(env.DB, "SELECT storage_key FROM property_photos WHERE id = ? AND property_id = ?", [photoId, item.id]);
    if (!photo) throw new ApiError(404, "Photo not found");
    await stmt(env.DB, "DELETE FROM property_photos WHERE id = ?", [photoId]).run();
    c.executionCtx.waitUntil(deletePhotos(env, [photo.storage_key]));
    if (item.published) await requestSiteRebuild(env);
    return c.json({ photos: await photosOf(env, item.id) });
  });

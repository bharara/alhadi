import { Hono } from "hono";
import { z } from "zod";
import { all, first, newId, nowIso, stmt } from "../db";
import type { AuthedEnv, Env } from "../env";
import { ApiError } from "../http";
import { requestSiteRebuild } from "../site-build";
import { idParam, zJson, zParam } from "../validation";
import { MAX_PHOTOS } from "./fields";
import { deletePhotos, photoUrls, putPhoto } from "../media/storage";
import { readImageUpload } from "../media/upload";
import { loadEditable } from "./store";

type PhotoRow = { id: string; storage_key: string; width: number; height: number; alt: string | null; sort_order: number };

async function photosOf(env: Env, propertyId: string) {
  const rows = await all<PhotoRow>(env.DB, "SELECT id, storage_key, width, height, alt, sort_order FROM property_photos WHERE property_id = ? ORDER BY sort_order, created_at", [propertyId]);
  return rows.map(({ storage_key, ...photo }) => ({ ...photo, ...photoUrls(env, storage_key) }));
}

// Mounted at /inventory/:id/photos. The browser resizes photos to WebP before uploading (src/lib/images.ts).
export const photoRoutes = new Hono<AuthedEnv>()
  .get("/", zParam(idParam), async (c) => c.json({ photos: await photosOf(c.env, c.req.valid("param").id) }))
  .post("/", zParam(idParam), async (c) => {
    const env = c.env;
    const item = await loadEditable(env, c.req.valid("param").id, c.get("user"));
    if (item.photo_count >= MAX_PHOTOS) throw new ApiError(400, `A property can have at most ${MAX_PHOTOS} photos`);
    const { full, thumb, width, height, alt } = await readImageUpload(c.req);
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

import type { Env } from "../env";

// Each photo is two R2 objects under one key: the full image and its thumbnail.
const files = (key: string) => ({ full: `${key}-1600.webp`, thumb: `${key}-600.webp` });

const photoObjectKeys = (keys: string[]) => keys.flatMap((key) => Object.values(files(key)));

export function photoUrls(env: Env, key: string) {
  const { full, thumb } = files(key);
  return { full: `${env.MEDIA_URL}/${full}`, thumb: `${env.MEDIA_URL}/${thumb}` };
}

export async function putPhoto(env: Env, key: string, full: ArrayBuffer, thumb: ArrayBuffer): Promise<void> {
  const meta = { httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" } };
  const names = files(key);
  await Promise.all([env.PHOTOS.put(names.full, full, meta), env.PHOTOS.put(names.thumb, thumb, meta)]);
}

export async function deletePhotos(env: Env, keys: string[]): Promise<void> {
  if (keys.length) await env.PHOTOS.delete(photoObjectKeys(keys));
}

/** Deletes every object under a key prefix, e.g. an article's image folder. */
export async function deletePrefix(env: Env, prefix: string): Promise<void> {
  for (let cursor: string | undefined; ; ) {
    const page = await env.PHOTOS.list({ prefix, cursor });
    if (page.objects.length) await env.PHOTOS.delete(page.objects.map((o) => o.key));
    if (!page.truncated) return;
    cursor = page.cursor;
  }
}

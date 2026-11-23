// @ts-check
import { defineConfig } from 'astro/config';

const localMediaHost = /** @type {{ env: Record<string, string | undefined> }} */ (/** @type {any} */ (globalThis).process).env.LOCAL_MEDIA_HOST;

export default defineConfig({
  site: 'https://bestbuilderdeveloper.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto', format: 'directory' },
  // Must match the dashboard's MEDIA_URL, or share images stay WebP (shareImage() fails the build).
  // LOCAL_MEDIA_HOST lets a local build read photos from a local dashboard (e.g. localhost); unset in production.
  image: { domains: ['media.bestbuilderdeveloper.com', ...(localMediaHost ? [localMediaHost] : [])] },
});

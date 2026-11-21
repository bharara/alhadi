// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://bestbuilderdeveloper.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto', format: 'directory' },
  // Must match the dashboard's MEDIA_URL, or share images stay WebP (shareImage() fails the build).
  image: { domains: ['media.bestbuilderdeveloper.com'] },
});

// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://bestbuilderdeveloper.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto', format: 'directory' },
  // Property photos live on the media bucket; the build turns each cover into a JPEG share image.
  image: { domains: ['media.bestbuilderdeveloper.com'] },
});

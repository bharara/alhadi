// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://bestbuilderdeveloper.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto', format: 'directory' },
});

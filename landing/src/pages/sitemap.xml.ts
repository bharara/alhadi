import type { APIRoute } from 'astro';
import { projects } from '../data/site';

export const GET: APIRoute = ({ site }) => {
  const lastmod = new Date().toISOString().slice(0, 10);
  const paths = ['/', ...projects.map((p) => `/${p.slug}/`)];
  const urls = paths
    .map((path) => {
      const loc = new URL(path, site).href;
      const priority = path === '/' ? '1.0' : '0.9';
      return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>${priority}</priority></url>`;
    })
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};

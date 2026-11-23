import type { APIRoute } from 'astro';
import { projects } from '../data/site';
import { listingPath, listings } from '../data/listings';
import { articlePath, articles } from '../data/articles';

export const GET: APIRoute = ({ site }) => {
  const today = new Date().toISOString().slice(0, 10);
  const entries = [
    { path: '/', lastmod: today, priority: '1.0' },
    ...projects.map((p) => ({ path: `/${p.slug}/`, lastmod: today, priority: '0.9' })),
    { path: '/properties/', lastmod: today, priority: '0.9' },
    ...listings.map((l) => ({ path: listingPath(l), lastmod: l.updated_at.slice(0, 10), priority: '0.8' })),
    ...(articles.length ? [{ path: '/articles/', lastmod: articles.map((a) => a.updated_at).sort().at(-1)!.slice(0, 10), priority: '0.7' }] : []),
    ...articles.map((a) => ({ path: articlePath(a), lastmod: a.updated_at.slice(0, 10), priority: '0.7' })),
  ];
  const urls = entries
    .map(({ path, lastmod, priority }) => `  <url><loc>${new URL(path, site).href}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>${priority}</priority></url>`)
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};

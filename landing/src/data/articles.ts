import { listingsApi } from './site';

export interface ArticleCover {
  full: string;
  thumb: string;
  width: number;
  height: number;
  alt: string | null;
}

// Mirrors publishedArticles() in dashboard/worker/articles/store.ts.
export interface Article {
  id: string;
  slug: string;
  url: string;
  title: string;
  excerpt: string | null;
  /** Sanitised by the dashboard Worker on save (dashboard/worker/articles/sanitize.ts). */
  body_html: string;
  cover: ArticleCover | null;
  seo_title: string | null;
  seo_description: string | null;
  tags: string[];
  project_slug: string | null;
  project_name: string | null;
  featured: boolean;
  author_name: string | null;
  published_at: string;
  updated_at: string;
}

async function load(): Promise<Article[]> {
  const url = `${listingsApi}/api/public/articles`;
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
  try {
    const response = await fetch(url);
    // A Worker deployed before articles existed answers 404: build without them rather than fail.
    if (response.status === 404) {
      console.warn(`[articles] ${url} answered 404; building without articles.`);
      return [];
    }
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return ((await response.json()) as { articles: Article[] }).articles;
  } catch (error) {
    // A Cloudflare build must never publish a site that silently lost its articles.
    if (env.CF_PAGES || env.CI) throw error;
    console.warn(`[articles] ${(error as Error).message}; building without articles.`);
    return [];
  }
}

export const articles = await load();

export const articlePath = (a: Pick<Article, 'slug'>) => `/articles/${a.slug}/`;

export const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

export const wordCount = (a: Article) => textOf(a.body_html).split(' ').filter(Boolean).length;

export const readingMinutes = (a: Article) => Math.max(1, Math.round(wordCount(a) / 200));

/** Card and meta text: the excerpt, or the start of the article. */
export function summaryOf(a: Article, max = 160): string {
  const text = a.excerpt ?? textOf(a.body_html);
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text;
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' });
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

/** The home page shows featured articles first, then the newest. */
export const homeArticles = (limit = 3) => [...articles.filter((a) => a.featured), ...articles.filter((a) => !a.featured)].slice(0, limit);

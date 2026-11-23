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
  title: string;
  excerpt: string | null;
  /** Sanitised by the dashboard Worker on save (dashboard/worker/articles/sanitize.ts). */
  body_html: string;
  words: number;
  /** The excerpt, or the start of the article. */
  summary: string;
  cover: ArticleCover | null;
  seo_title: string | null;
  seo_description: string | null;
  tags: string[];
  project_slug: string | null;
  featured: boolean;
  author_name: string | null;
  published_at: string;
  updated_at: string;
}

async function load(): Promise<Article[]> {
  const url = `${listingsApi}/api/public/articles`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return ((await response.json()) as { articles: Article[] }).articles;
  } catch (error) {
    // A Cloudflare build must never publish a site that silently lost its articles.
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (env.CF_PAGES || env.CI) throw error;
    console.warn(`[articles] ${(error as Error).message}; building without articles.`);
    return [];
  }
}

export const articles = await load();

export const articlePath = (a: Pick<Article, 'slug'>) => `/articles/${a.slug}/`;

export const readingMinutes = (a: Article) => Math.max(1, Math.round(a.words / 200));

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' });
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

/** The home page shows featured articles first, then the newest. */
export const homeArticles = (limit = 3) => [...articles.filter((a) => a.featured), ...articles.filter((a) => !a.featured)].slice(0, limit);

import { all, first, parseJson } from "../db";
import type { Env } from "../env";
import { ApiError } from "../http";
import { WEBSITE_PROJECTS, type WebsiteProjectSlug } from "../inventory/fields";
import { photoUrls } from "../inventory/photo-storage";

export const ARTICLE_STATUSES = ["draft", "published"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_html: string;
  cover_key: string | null;
  cover_width: number | null;
  cover_height: number | null;
  cover_alt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  tags: string;
  project_slug: WebsiteProjectSlug | null;
  status: ArticleStatus;
  featured: number;
  author_name: string | null;
  created_by_user_id: string | null;
  created_by_username: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export const ARTICLE_SELECT = `SELECT a.*, u.username AS created_by_username FROM articles a LEFT JOIN users u ON u.id = a.created_by_user_id`;

/** Every article image lives under this R2 prefix, so deleting an article can clear its folder. */
export const articleFolder = (id: string) => `articles/${id}/`;

const projectName = new Map<string, string>(WEBSITE_PROJECTS.map((p) => [p.slug, p.name]));

export function coverOf(env: Env, row: Pick<ArticleRow, "cover_key" | "cover_width" | "cover_height" | "cover_alt">) {
  if (!row.cover_key || !row.cover_width || !row.cover_height) return null;
  return { key: row.cover_key, ...photoUrls(env, row.cover_key), width: row.cover_width, height: row.cover_height, alt: row.cover_alt };
}

export function toArticle(env: Env, row: ArticleRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body_html: row.body_html,
    cover: coverOf(env, row),
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    tags: parseJson<string[]>(row.tags, []),
    project_slug: row.project_slug,
    project_name: row.project_slug ? (projectName.get(row.project_slug) ?? null) : null,
    status: row.status,
    featured: Boolean(row.featured),
    author_name: row.author_name,
    created_by_username: row.created_by_username,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

export async function loadArticleRow(env: Env, id: string): Promise<ArticleRow> {
  const row = await first<ArticleRow>(env.DB, `${ARTICLE_SELECT} WHERE a.id = ?`, [id]);
  if (!row) throw new ApiError(404, "Article not found");
  return row;
}

/** Published articles for the landing build, newest first. Only public fields: no creator or draft content. */
export async function publishedArticles(env: Env) {
  const rows = await all<ArticleRow>(env.DB, `${ARTICLE_SELECT} WHERE a.status = 'published' ORDER BY a.published_at DESC, a.id LIMIT 500`);
  const site = env.PUBLIC_SITE_URL.replace(/\/$/, "");
  return rows.map((row) => {
    const { created_by_username: _creator, status: _status, created_at: _created, cover, ...article } = toArticle(env, row);
    return { ...article, url: `${site}/articles/${row.slug}/`, cover: cover && { full: cover.full, thumb: cover.thumb, width: cover.width, height: cover.height, alt: cover.alt } };
  });
}

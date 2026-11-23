import { all, first, likeContains, parseJson } from "../db";
import type { Env, SessionUser } from "../env";
import { ApiError } from "../http";
import { WEBSITE_PROJECTS, type WebsiteProjectSlug } from "../inventory/fields";
import { photoUrls } from "../media/storage";
import { textOf } from "./sanitize";

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

function coverOf(env: Env, row: ArticleRow) {
  if (!row.cover_key || !row.cover_width || !row.cover_height) return null;
  return { key: row.cover_key, ...photoUrls(env, row.cover_key), width: row.cover_width, height: row.cover_height, alt: row.cover_alt };
}

const SUMMARY_MAX = 160;

export function toArticle(env: Env, row: ArticleRow) {
  const text = textOf(row.body_html);
  return {
    id: row.id,
    slug: row.slug,
    // Where the article is, or will be once published.
    url: `${env.PUBLIC_SITE_URL.replace(/\/$/, "")}/articles/${row.slug}/`,
    title: row.title,
    excerpt: row.excerpt,
    body_html: row.body_html,
    words: text.split(" ").filter(Boolean).length,
    // Card and meta text: the excerpt, or the start of the article.
    summary: row.excerpt ?? (text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1).replace(/\s+\S*$/, "")}…` : text),
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

/** Anyone can write drafts; what reaches the public site is an admin's call. */
export function assertCanEdit(user: SessionUser, article: ArticleRow, nextStatus: ArticleStatus = article.status): void {
  if (user.role !== "admin" && (article.status === "published" || nextStatus === "published")) throw new ApiError(403, "Only admins can publish or change published articles");
}

export type ArticleFilters = { search?: string; status?: ArticleStatus; limit: number };

/** Articles without their bodies, most recently edited first. */
export async function searchArticles(env: Env, { search, status, limit }: ArticleFilters) {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (search?.trim()) {
    clauses.push("(a.title LIKE ? ESCAPE '\\' OR a.excerpt LIKE ? ESCAPE '\\' OR a.slug LIKE ? ESCAPE '\\')");
    params.push(...Array(3).fill(likeContains(search.trim())));
  }
  if (status) {
    clauses.push("a.status = ?");
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await all<ArticleRow>(env.DB, `${ARTICLE_SELECT} ${where} ORDER BY COALESCE(a.updated_at, a.created_at) DESC LIMIT ?`, [...params, limit]);
  return rows.map((row) => {
    const { body_html: _body, ...article } = toArticle(env, row);
    return article;
  });
}

/** Published articles for the landing build (landing/src/data/articles.ts), newest first. */
export async function publishedArticles(env: Env) {
  const rows = await all<ArticleRow>(env.DB, `${ARTICLE_SELECT} WHERE a.status = 'published' ORDER BY a.published_at DESC, a.id LIMIT 500`);
  return rows.map((row) => {
    const a = toArticle(env, row);
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      excerpt: a.excerpt,
      body_html: a.body_html,
      words: a.words,
      summary: a.summary,
      cover: a.cover && { full: a.cover.full, thumb: a.cover.thumb, width: a.cover.width, height: a.cover.height, alt: a.cover.alt },
      seo_title: a.seo_title,
      seo_description: a.seo_description,
      tags: a.tags,
      project_slug: a.project_slug,
      featured: a.featured,
      author_name: a.author_name,
      published_at: a.published_at!,
      updated_at: a.updated_at,
    };
  });
}

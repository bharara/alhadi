import { newId, nowIso, stmt } from "../db";
import type { Env } from "../env";
import type { WebsiteProjectSlug } from "../inventory/fields";
import { slugify, uniqueSlug } from "../slug";
import { requestSiteRebuild } from "../site-build";
import { sanitizeArticleHtml } from "./sanitize";
import { loadArticleRow, toArticle } from "./store";

export type NewArticle = {
  title: string;
  excerpt?: string | null;
  body_html?: string;
  tags?: string[];
  project_slug?: WebsiteProjectSlug | null;
  seo_title?: string | null;
  seo_description?: string | null;
  author_name?: string | null;
  publish?: boolean;
};

/** Creates an article (a draft unless `publish`), with a unique web address taken from the title. */
export async function createArticle(env: Env, userId: string, input: NewArticle) {
  const id = newId();
  const now = nowIso();
  const slug = await uniqueSlug(env.DB, "articles", slugify(input.title, "article"), id);
  const body = input.body_html ? await sanitizeArticleHtml(input.body_html, env.MEDIA_URL, id) : "";
  await stmt(
    env.DB,
    `INSERT INTO articles (id, slug, title, excerpt, body_html, tags, project_slug, seo_title, seo_description, author_name, status, published_at, created_by_user_id, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)`,
    [
      id,
      slug,
      input.title.trim(),
      input.excerpt?.trim() || null,
      body,
      JSON.stringify([...new Set(input.tags ?? [])]),
      input.project_slug ?? null,
      input.seo_title?.trim() || null,
      input.seo_description?.trim() || null,
      input.author_name?.trim() || null,
      input.publish ? "published" : "draft",
      input.publish ? now : null,
      userId,
      now,
    ],
  ).run();
  if (input.publish) await requestSiteRebuild(env);
  return toArticle(env, await loadArticleRow(env, id));
}

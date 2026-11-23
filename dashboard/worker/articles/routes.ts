import { Hono } from "hono";
import { z } from "zod";
import { all, first, likeContains, newId, nowIso, stmt, type Db } from "../db";
import type { AuthedEnv, Env } from "../env";
import { ApiError } from "../http";
import { WEBSITE_PROJECT_SLUGS } from "../inventory/fields";
import { deletePhotos, photoUrls, putPhoto } from "../inventory/photo-storage";
import { SLUG, slugify } from "../inventory/web";
import { requestSiteRebuild } from "../site-build";
import { idParam, optionalText, requiredText, zJson, zParam } from "../validation";
import { sanitizeArticleHtml, textOf } from "./sanitize";
import { ARTICLE_SELECT, ARTICLE_STATUSES, articleFolder, loadArticleRow, toArticle, type ArticleRow } from "./store";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_BODY = 300_000;

const articleUpdate = z
  .object({
    title: requiredText(200),
    slug: z.string().trim().toLowerCase().min(1).max(120).regex(SLUG, "Use lowercase letters, numbers and single hyphens"),
    excerpt: optionalText(400),
    body_html: z.string().max(MAX_BODY, "The article is too long"),
    cover: z.object({ key: z.string().min(1).max(200), width: z.number().int().min(1).max(4000), height: z.number().int().min(1).max(4000) }).nullable(),
    cover_alt: optionalText(200),
    seo_title: optionalText(120),
    seo_description: optionalText(320),
    tags: z.array(z.string().trim().min(1).max(40)).max(10),
    project_slug: z.enum(WEBSITE_PROJECT_SLUGS).nullable(),
    featured: z.boolean(),
    author_name: optionalText(120),
    status: z.enum(ARTICLE_STATUSES),
  })
  .partial();

const searchSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(ARTICLE_STATUSES).optional(),
});

const imageUpload = z.object({
  full: z.instanceof(File),
  thumb: z.instanceof(File),
  width: z.coerce.number().int().min(1).max(4000),
  height: z.coerce.number().int().min(1).max(4000),
});

const isWebp = (f: File) => f.type === "image/webp" && f.size > 0 && f.size <= MAX_IMAGE_BYTES;

async function uniqueSlug(db: Db, base: string, exceptId: string): Promise<string> {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await first(db, "SELECT id FROM articles WHERE slug = ? AND id != ?", [candidate, exceptId]))) return candidate;
  }
}

async function deleteFolder(env: Env, id: string): Promise<void> {
  const prefix = articleFolder(id);
  for (let cursor: string | undefined; ; ) {
    const page = await env.PHOTOS.list({ prefix, cursor });
    if (page.objects.length) await env.PHOTOS.delete(page.objects.map((o) => o.key));
    if (!page.truncated) return;
    cursor = page.cursor;
  }
}

export const articleRoutes = new Hono<AuthedEnv>()
  .post("/search", zJson(searchSchema), async (c) => {
    const { search, status } = c.req.valid("json");
    const clauses: string[] = [];
    const params: string[] = [];
    if (search?.trim()) {
      clauses.push("(a.title LIKE ? ESCAPE '\\' OR a.excerpt LIKE ? ESCAPE '\\' OR a.slug LIKE ? ESCAPE '\\')");
      params.push(...Array(3).fill(likeContains(search.trim())));
    }
    if (status) clauses.push("a.status = ?"), params.push(status);
    const rows = await all<ArticleRow>(
      c.env.DB,
      `${ARTICLE_SELECT} ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
       ORDER BY COALESCE(a.updated_at, a.created_at) DESC LIMIT 500`,
      params,
    );
    // The list doesn't need bodies; word counts are enough.
    return c.json({ articles: rows.map((row) => ({ ...toArticle(c.env, row), body_html: undefined, words: textOf(row.body_html).split(" ").filter(Boolean).length })) });
  })
  .post("/", zJson(z.object({ title: requiredText(200) })), async (c) => {
    const { title } = c.req.valid("json");
    const id = newId();
    const slug = await uniqueSlug(c.env.DB, slugify(title, "article"), id);
    await stmt(c.env.DB, "INSERT INTO articles (id, slug, title, created_by_user_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)", [id, slug, title, c.get("user").id, nowIso()]).run();
    return c.json(toArticle(c.env, await loadArticleRow(c.env, id)), 201);
  })
  .get("/:id", zParam(idParam), async (c) => c.json(toArticle(c.env, await loadArticleRow(c.env, c.req.valid("param").id))))
  .patch("/:id", zParam(idParam), zJson(articleUpdate), async (c) => {
    const env = c.env;
    const current = await loadArticleRow(env, c.req.valid("param").id);
    const body = c.req.valid("json");
    const isAdmin = c.get("user").role === "admin";
    // Anyone can write drafts; what reaches the public site is an admin's call.
    if (!isAdmin && (current.status === "published" || body.status === "published")) throw new ApiError(403, "Only admins can publish or edit published articles");

    const columns: Record<string, string | number | null> = {};
    for (const key of ["title", "excerpt", "cover_alt", "seo_title", "seo_description", "project_slug", "author_name", "status"] as const) {
      if (body[key] !== undefined) columns[key] = body[key];
    }
    if (body.slug !== undefined && body.slug !== current.slug) {
      if (await first(env.DB, "SELECT id FROM articles WHERE slug = ? AND id != ?", [body.slug, current.id])) throw new ApiError(409, "Another article already uses this web address");
      columns.slug = body.slug;
    }
    if (body.body_html !== undefined) columns.body_html = await sanitizeArticleHtml(body.body_html, env.MEDIA_URL, current.id);
    if (body.tags !== undefined) columns.tags = JSON.stringify([...new Set(body.tags)]);
    if (body.featured !== undefined) columns.featured = body.featured ? 1 : 0;
    if (body.cover !== undefined) {
      if (body.cover && !body.cover.key.startsWith(articleFolder(current.id))) throw new ApiError(422, "Upload the cover image to this article first");
      columns.cover_key = body.cover?.key ?? null;
      columns.cover_width = body.cover?.width ?? null;
      columns.cover_height = body.cover?.height ?? null;
    }
    if (body.status === "published" && !current.published_at) columns.published_at = nowIso();
    if (body.status === "draft") columns.featured = 0;

    const entries = Object.entries(columns);
    if (entries.length) {
      await stmt(env.DB, `UPDATE articles SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`, [...entries.map(([, v]) => v), nowIso(), current.id]).run();
      if (current.status === "published" || body.status === "published") await requestSiteRebuild(env);
    }
    // A replaced cover is deleted unless the article body still shows it.
    const oldCover = current.cover_key;
    const nextBody = (columns.body_html as string | undefined) ?? current.body_html;
    if (oldCover && "cover_key" in columns && columns.cover_key !== oldCover && !nextBody.includes(oldCover)) c.executionCtx.waitUntil(deletePhotos(env, [oldCover]));
    return c.json(toArticle(env, await loadArticleRow(env, current.id)));
  })
  .delete("/:id", zParam(idParam), async (c) => {
    const env = c.env;
    const current = await loadArticleRow(env, c.req.valid("param").id);
    if (current.status === "published" && c.get("user").role !== "admin") throw new ApiError(403, "Only admins can delete published articles");
    await stmt(env.DB, "DELETE FROM articles WHERE id = ?", [current.id]).run();
    c.executionCtx.waitUntil(deleteFolder(env, current.id));
    if (current.status === "published") await requestSiteRebuild(env);
    return c.json({ ok: true });
  })
  // Cover and in-text images. The browser resizes them to WebP first (src/pages/inventory/photos.ts).
  .post("/:id/images", zParam(idParam), async (c) => {
    const env = c.env;
    const article = await loadArticleRow(env, c.req.valid("param").id);
    const parsed = imageUpload.safeParse(Object.fromEntries((await c.req.formData()).entries()));
    if (!parsed.success || !isWebp(parsed.data.full) || !isWebp(parsed.data.thumb)) throw new ApiError(422, "Upload WebP images under 4 MB (the dashboard converts images for you)");
    const { full, thumb, width, height } = parsed.data;
    const key = `${articleFolder(article.id)}${newId()}`;
    await putPhoto(env, key, await full.arrayBuffer(), await thumb.arrayBuffer());
    return c.json({ key, ...photoUrls(env, key), width, height }, 201);
  });

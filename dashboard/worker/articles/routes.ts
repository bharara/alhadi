import { Hono } from "hono";
import { z } from "zod";
import { first, newId, nowIso, stmt } from "../db";
import type { AuthedEnv } from "../env";
import { ApiError } from "../http";
import { WEBSITE_PROJECT_SLUGS } from "../inventory/fields";
import { deletePhotos, deletePrefix, photoUrls, putPhoto } from "../media/storage";
import { readImageUpload } from "../media/upload";
import { requestSiteRebuild } from "../site-build";
import { slugSchema } from "../slug";
import { idParam, optionalText, requiredText, zJson, zParam } from "../validation";
import { createArticle } from "./create";
import { sanitizeArticleHtml } from "./sanitize";
import { ARTICLE_STATUSES, articleFolder, assertCanEdit, loadArticleRow, searchArticles, toArticle } from "./store";

const articleUpdate = z
  .object({
    title: requiredText(200),
    slug: slugSchema,
    excerpt: optionalText(400),
    body_html: z.string().max(300_000, "The article is too long"),
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

const searchSchema = z.object({ search: z.string().max(200).optional(), status: z.enum(ARTICLE_STATUSES).optional() });

export const articleRoutes = new Hono<AuthedEnv>()
  .post("/search", zJson(searchSchema), async (c) => c.json({ articles: await searchArticles(c.env, { ...c.req.valid("json"), limit: 500 }) }))
  .post("/", zJson(z.object({ title: requiredText(200) })), async (c) => c.json(await createArticle(c.env, c.get("user").id, { title: c.req.valid("json").title }), 201))
  .get("/:id", zParam(idParam), async (c) => c.json(toArticle(c.env, await loadArticleRow(c.env, c.req.valid("param").id))))
  .patch("/:id", zParam(idParam), zJson(articleUpdate), async (c) => {
    const env = c.env;
    const current = await loadArticleRow(env, c.req.valid("param").id);
    const body = c.req.valid("json");
    const status = body.status ?? current.status;
    assertCanEdit(c.get("user"), current, status);

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
    // Only a published article can be featured on the home page.
    if (body.featured !== undefined || body.status !== undefined) columns.featured = status === "published" && (body.featured ?? Boolean(current.featured)) ? 1 : 0;
    if (body.cover !== undefined) {
      if (body.cover && !body.cover.key.startsWith(articleFolder(current.id))) throw new ApiError(422, "Upload the cover image to this article first");
      columns.cover_key = body.cover?.key ?? null;
      columns.cover_width = body.cover?.width ?? null;
      columns.cover_height = body.cover?.height ?? null;
    }
    if (status === "published" && !current.published_at) columns.published_at = nowIso();

    const entries = Object.entries(columns);
    if (entries.length) {
      const sets = entries.map(([k]) => `${k} = ?`).join(", ");
      await stmt(env.DB, `UPDATE articles SET ${sets}, updated_at = ? WHERE id = ?`, [...entries.map(([, v]) => v), nowIso(), current.id]).run();
      if (current.status === "published" || status === "published") await requestSiteRebuild(env);
    }
    // A replaced cover is deleted unless the article body still shows it.
    const oldCover = current.cover_key;
    const nextBody = (columns.body_html as string | undefined) ?? current.body_html;
    const coverReplaced = oldCover && "cover_key" in columns && columns.cover_key !== oldCover;
    if (coverReplaced && !nextBody.includes(oldCover)) c.executionCtx.waitUntil(deletePhotos(env, [oldCover]));
    return c.json(toArticle(env, await loadArticleRow(env, current.id)));
  })
  .delete("/:id", zParam(idParam), async (c) => {
    const env = c.env;
    const current = await loadArticleRow(env, c.req.valid("param").id);
    assertCanEdit(c.get("user"), current);
    await stmt(env.DB, "DELETE FROM articles WHERE id = ?", [current.id]).run();
    c.executionCtx.waitUntil(deletePrefix(env, articleFolder(current.id)));
    if (current.status === "published") await requestSiteRebuild(env);
    return c.json({ ok: true });
  })
  // Cover and in-text images, resized to WebP in the browser first.
  .post("/:id/images", zParam(idParam), async (c) => {
    const env = c.env;
    const article = await loadArticleRow(env, c.req.valid("param").id);
    assertCanEdit(c.get("user"), article);
    const { full, thumb, width, height } = await readImageUpload(c.req);
    const key = `${articleFolder(article.id)}${newId()}`;
    await putPhoto(env, key, await full.arrayBuffer(), await thumb.arrayBuffer());
    return c.json({ key, ...photoUrls(env, key), width, height }, 201);
  });

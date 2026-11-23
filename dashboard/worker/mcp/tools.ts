// Read CRM and website data, and add leads and articles; updates and deletes stay in the dashboard.
import { z } from "zod";
import { all, first, newId } from "../db";
import { ApiError } from "../http";
import { createArticle } from "../articles/create";
import { ALLOWED } from "../articles/sanitize";
import { ARTICLE_SELECT, ARTICLE_STATUSES, searchArticles, toArticle, type ArticleRow } from "../articles/store";
import { WEBSITE_PROJECT_SLUGS } from "../inventory/fields";
import { normalizePhoneOrThrow, normalizeProspectFields, PROSPECT_STATUSES } from "../prospects/fields";
import { insertProspect, loadProspect, PROSPECT_COUNT, PROSPECT_SELECT, prospectWhere, toProspect, type ProspectRow } from "../prospects/store";
import { defineTool, type Tool } from "./registry";
import { describeSchema, MAX_ROWS, runReadOnlySql } from "./sql";

const sqlTools: Tool[] = [
  defineTool({
    name: "describe_data",
    title: "Describe the database",
    access: "read",
    description:
      "Lists the tables and views query_sql can read, with their CREATE statements. Main tables: prospects (leads) and prospect_touches (calls, WhatsApp, visits), inventory_items (properties, with web_* columns for the website), articles, web_events (site analytics, one row per pageview or enquiry), gsc_rows/gsc_daily (Google Search Console), team_members (dashboard users).",
    input: z.object({}),
    run: async ({ env }) => ({ tables: await describeSchema(env.DB) }),
  }),
  defineTool({
    name: "query_sql",
    title: "Run a read-only SQL query",
    access: "read",
    description: `One read-only SELECT (WITH allowed) against the CRM's D1 database (SQLite). Returns at most ${MAX_ROWS} rows; truncated is true when there were more, so aggregate (COUNT, GROUP BY) rather than paging through tables. Timestamps are UTC ISO text; business days are Pakistan time (UTC+5). JSON columns (tags, extra, web_features) work with json_each/json_extract. Credentials tables are blocked; join team_members for usernames. Call describe_data for the schema.`,
    input: z.object({
      sql: z.string().min(1).max(10_000).describe("One statement; use ? placeholders for params."),
      params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).max(100).default([]),
    }),
    run: ({ env }, { sql, params }) => runReadOnlySql(env.DB, sql, params),
  }),
];

const prospectTools: Tool[] = [
  defineTool({
    name: "search_prospects",
    title: "Search leads",
    access: "read",
    description: "Finds leads (prospects) by text across name, phone, email, company, title, tags and assignee, optionally narrowed by status or tag. Newest first.",
    input: z.object({
      search: z.string().max(255).optional(),
      status: z.enum(PROSPECT_STATUSES).optional(),
      tag: z.string().max(255).optional().describe("Exact tag, e.g. Sitara Villas"),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
    }),
    run: async ({ env }, { limit, offset, ...filters }) => {
      const { where, params } = prospectWhere(filters);
      const [rows, count] = await Promise.all([
        all<ProspectRow>(env.DB, `${PROSPECT_SELECT} ${where} ORDER BY p.created_at DESC, p.id LIMIT ? OFFSET ?`, [...params, limit, offset]),
        first<{ n: number }>(env.DB, `${PROSPECT_COUNT} ${where}`, params),
      ]);
      return { prospects: rows.map(toProspect), total: count?.n ?? 0, limit, offset };
    },
  }),
  defineTool({
    name: "get_prospect",
    title: "Get a lead",
    access: "read",
    description: "One lead by id or phone number, with its 50 most recent touches (calls, WhatsApp messages, visits, emails).",
    input: z.object({ id: z.string().max(64).optional(), phone: z.string().max(64).optional() }).refine((v) => v.id || v.phone, "Give an id or a phone"),
    run: async ({ env }, { id, phone }) => {
      const prospectId = id ?? (await first<{ id: string }>(env.DB, "SELECT id FROM prospects WHERE phone = ?", [normalizePhoneOrThrow(phone!).primary]))?.id;
      if (!prospectId) throw new ApiError(404, "No lead with that phone number");
      const prospect = await loadProspect(env.DB, prospectId);
      const touches = await all(
        env.DB,
        `SELECT t.id, t.kind, t.occurred_at, t.summary, t.call_status, u.username AS by_username
         FROM prospect_touches t LEFT JOIN users u ON u.id = t.touching_user_id WHERE t.prospect_id = ? ORDER BY t.occurred_at DESC LIMIT 50`,
        [prospectId],
      );
      return { prospect, touches };
    },
  }),
  defineTool({
    name: "add_prospect",
    title: "Add a lead",
    access: "write",
    description:
      "Adds one lead to the CRM. Phone is required and is normalised to Pakistani format (e.g. 03001234567). If a lead with that phone already exists, nothing is changed and the existing lead is returned with created: false.",
    input: z.object({
      phone: z.string().min(1).max(64),
      name: z.string().max(255).optional(),
      email: z.email().max(320).optional(),
      company: z.string().max(255).optional(),
      title: z.string().max(255).optional(),
      notes: z.string().max(20000).optional(),
      tags: z.array(z.string().max(255)).max(20).optional().describe("e.g. the project they asked about: Sitara Villas, Abdullah Gardens, City Walk"),
      status: z.enum(PROSPECT_STATUSES).default("cold"),
      assigned_username: z.string().max(255).optional().describe("Dashboard username to assign the lead to"),
    }),
    run: async ({ env }, { assigned_username, ...fields }) => {
      const phone = normalizePhoneOrThrow(fields.phone).primary;
      const existing = await first<{ id: string }>(env.DB, "SELECT id FROM prospects WHERE phone = ?", [phone]);
      if (existing) return { created: false, prospect: await loadProspect(env.DB, existing.id) };
      const assignee = assigned_username
        ? await first<{ id: string }>(env.DB, "SELECT id FROM users WHERE username = ? AND is_active = 1", [assigned_username.trim().toLowerCase()])
        : null;
      if (assigned_username && !assignee) throw new ApiError(422, `No active user named ${assigned_username}`);
      const id = newId();
      await insertProspect(env.DB, id, normalizeProspectFields({ ...fields, assigned_user_id: assignee?.id ?? null })).run();
      return { created: true, prospect: await loadProspect(env.DB, id) };
    },
  }),
];

const articleTools: Tool[] = [
  defineTool({
    name: "list_articles",
    title: "List articles",
    access: "read",
    description: "Articles written for bestbuilderdeveloper.com/articles/, most recently edited first, without their bodies. Filter by status or by text in the title, excerpt or web address.",
    input: z.object({
      status: z.enum(ARTICLE_STATUSES).optional(),
      search: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(100).default(25),
    }),
    run: async ({ env }, filters) => ({ articles: await searchArticles(env, filters) }),
  }),
  defineTool({
    name: "get_article",
    title: "Get an article",
    access: "read",
    description: "One article by id or web address (slug), including its HTML body. url is live only when status is published.",
    input: z.object({ id: z.string().max(64).optional(), slug: z.string().max(120).optional() }).refine((v) => v.id || v.slug, "Give an id or a slug"),
    run: async ({ env }, { id, slug }) => {
      const row = await first<ArticleRow>(env.DB, `${ARTICLE_SELECT} WHERE ${id ? "a.id" : "a.slug"} = ?`, [id ?? slug!]);
      if (!row) throw new ApiError(404, "Article not found");
      return toArticle(env, row);
    },
  }),
  defineTool({
    name: "create_article",
    title: "Create an article",
    access: "write",
    description: `Adds an article. It is a draft unless publish is true; drafts can be reviewed and published from Dashboard → Articles (dashboard_url). The body is HTML using only ${Object.keys(ALLOWED)
      .filter((tag) => tag !== "img")
      .join(", ")}; anything else is stripped. Images are added afterwards in the dashboard. A published article appears on the site after the automatic rebuild, a few minutes later.`,
    input: z.object({
      title: z.string().trim().min(1).max(200),
      body_html: z.string().max(300_000),
      excerpt: z.string().max(400).optional().describe("One or two sentences for cards and search results"),
      tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
      project_slug: z.enum(WEBSITE_PROJECT_SLUGS).optional().describe("Links the article to a project page"),
      seo_title: z.string().max(120).optional(),
      seo_description: z.string().max(320).optional(),
      author_name: z.string().max(120).optional().describe("Byline; omit to credit Best Builders & Developers"),
      publish: z.boolean().default(false),
    }),
    run: async ({ env, caller }, input) => {
      const article = await createArticle(env, caller.id, input);
      return { ...article, dashboard_url: `${env.APP_URL.replace(/\/$/, "")}/articles/${article.id}` };
    },
  }),
];

export const tools: Tool[] = [...sqlTools, ...prospectTools, ...articleTools];
export const toolsByName = new Map(tools.map((t) => [t.name, t]));

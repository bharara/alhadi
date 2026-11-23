import React from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { InferResponseType } from "hono/client";
import { crm, errorMessage, unwrap } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { QueryView, useAction, useQuery } from "@/lib/hooks";
import { WEBSITE_PROJECTS } from "@worker/inventory/fields";
import { useSession } from "@/session";
import { Button } from "@/ui/button";
import { Checkbox, Field, Input, Select, TagsInput, Textarea } from "@/ui/form";
import { Badge, Card, ConfirmDialog, PageHeader } from "@/ui/layout";
import { uploadArticleImage } from "@/lib/images";
import { RichEditor } from "./RichEditor";

type Article = InferResponseType<(typeof crm.articles)[":id"]["$get"], 200>;
type ProjectSlug = (typeof WEBSITE_PROJECTS)[number]["slug"];
type Cover = { key: string; full: string; thumb: string; width: number; height: number };

type Form = {
  title: string;
  slug: string;
  excerpt: string;
  body_html: string;
  cover: Cover | null;
  cover_alt: string;
  seo_title: string;
  seo_description: string;
  tags: string[];
  project_slug: ProjectSlug | "";
  featured: boolean;
  author_name: string;
};

const TAG_SUGGESTIONS = ["Buying guide", "Investment", "Sitara Villas", "Abdullah Gardens", "City Walk", "Faisalabad", "Construction", "News"];

const formOf = (a: Article): Form => ({
  title: a.title,
  slug: a.slug,
  excerpt: a.excerpt ?? "",
  body_html: a.body_html,
  cover: a.cover && { key: a.cover.key, full: a.cover.full, thumb: a.cover.thumb, width: a.cover.width, height: a.cover.height },
  cover_alt: a.cover?.alt ?? "",
  seo_title: a.seo_title ?? "",
  seo_description: a.seo_description ?? "",
  tags: a.tags,
  project_slug: a.project_slug ?? "",
  featured: a.featured,
  author_name: a.author_name ?? "",
});

function changesOf(form: Form, saved: Form) {
  const changed = (key: keyof Form) => JSON.stringify(form[key]) !== JSON.stringify(saved[key]);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(form) as (keyof Form)[]) if (changed(key)) out[key] = form[key];
  if ("cover" in out) out.cover = form.cover && { key: form.cover.key, width: form.cover.width, height: form.cover.height };
  if ("project_slug" in out) out.project_slug = form.project_slug || null;
  return out as Parameters<(typeof crm.articles)[":id"]["$patch"]>[0]["json"];
}

export function ArticleEditorPage() {
  const { articleId = "" } = useParams();
  const query = useQuery(() => unwrap(crm.articles[":id"].$get({ param: { id: articleId } })), articleId);
  return <QueryView query={query}>{(article) => <Editor key={article.id} article={article} onChange={(next) => query.setData(() => next)} />}</QueryView>;
}

function Editor({ article, onChange }: { article: Article; onChange: (a: Article) => void }) {
  const navigate = useNavigate();
  const { user } = useSession();
  const isAdmin = user.role === "admin";
  const locked = article.status === "published" && !isAdmin;
  const [form, setForm] = React.useState<Form>(() => formOf(article));
  // What the server last accepted, as sent: the Worker sanitises HTML, so comparing with its copy would never settle.
  const [saved, setSaved] = React.useState<Form>(() => formOf(article));
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const save = useAction((json: ReturnType<typeof changesOf>) => unwrap(crm.articles[":id"].$patch({ param: { id: article.id }, json })));
  const remove = useAction(() => unwrap(crm.articles[":id"].$delete({ param: { id: article.id } })));

  async function commit(extra: { status?: "draft" | "published" } = {}, message = "Saved") {
    const sent = form;
    const next = await save.run({ ...changesOf(sent, saved), ...extra });
    if (!next) return;
    // The server's copy of every field, except the body as the editor wrote it (see `saved`).
    const synced = { ...formOf(next), body_html: sent.body_html };
    setSaved(synced);
    // Keep anything typed while the save was in flight.
    setForm((f) => (f === sent ? synced : f));
    onChange(next);
    toast.success(message);
  }

  const saveRef = React.useRef(commit);
  saveRef.current = commit;
  const canSaveRef = React.useRef(false);
  canSaveRef.current = dirty && !locked && !save.pending;
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (canSaveRef.current) void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !remove.pending && currentLocation.pathname !== nextLocation.pathname);
  React.useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("You have unsaved changes. Leave without saving?")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  async function onDelete() {
    if (await remove.run()) {
      toast.success("Article deleted");
      navigate("/articles");
    }
  }

  const published = article.status === "published";


  return (
    <>
      <PageHeader
        crumbs={
          <Link to="/articles" className="hover:underline">
            Articles
          </Link>
        }
        title={form.title || "Untitled article"}
        lede={
          <span className="inline-flex flex-wrap items-center gap-2">
            {published ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}
            {dirty ? <span className="text-amber-700">Unsaved changes</span> : <span>Saved {formatWhen(article.updated_at)}</span>}
          </span>
        }
        actions={
          <>
            {published && (
              <a href={article.url} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm hover:bg-muted">
                View on site <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <Button variant="outline" pending={save.pending} disabled={!dirty || locked} onClick={() => commit()}>
              Save{published ? "" : " draft"}
            </Button>
            {isAdmin &&
              (published ? (
                <Button variant="outline" disabled={save.pending} onClick={() => commit({ status: "draft" }, "Unpublished. It leaves the site after the automatic rebuild.")}>
                  Unpublish
                </Button>
              ) : (
                <Button disabled={save.pending || !form.title.trim()} onClick={() => commit({ status: "published" }, "Published. It appears on the site after the automatic rebuild (a few minutes).")}>
                  Publish
                </Button>
              ))}
          </>
        }
      />

      {locked && <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">This article is live. Only admins can edit published articles.</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <input
            className="w-full rounded-lg border border-transparent bg-transparent px-1 py-1 text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60 hover:border-border focus:border-primary focus:bg-card"
            value={form.title}
            maxLength={200}
            placeholder="Article title"
            aria-label="Title"
            disabled={locked}
            onChange={(e) => set("title", e.target.value)}
          />
          <RichEditor articleId={article.id} value={form.body_html} disabled={locked} onChange={(html) => set("body_html", html)}
            onReady={(html) => {
              setForm((f) => ({ ...f, body_html: html }));
              setSaved((s) => ({ ...s, body_html: html }));
            }}
          />
        </div>

        <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4">
          <CoverCard articleId={article.id} cover={form.cover} alt={form.cover_alt} onCover={(c) => set("cover", c)} onAlt={(v) => set("cover_alt", v)} disabled={locked} />

          <Card title="Details">
            <div className="flex flex-col gap-4">
              <Field label="Web address" hint={published ? "Changing it breaks links already shared." : undefined}>
                <div className="flex min-w-0 items-stretch overflow-hidden rounded-md border border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
                  <span className="flex shrink-0 items-center bg-muted px-2.5 text-xs text-muted-foreground">/articles/</span>
                  <input className="h-10 min-w-0 flex-1 bg-card px-2.5 text-sm outline-none disabled:bg-muted" value={form.slug} maxLength={120} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
                </div>
              </Field>
              <Field label="Excerpt" hint={`${form.excerpt.length}/400. Shown on article cards and in search results.`}>
                <Textarea rows={3} maxLength={400} value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} />
              </Field>
              <Field label="Tags" hint="Up to 10.">
                <TagsInput value={form.tags} onChange={(v) => set("tags", v)} suggestions={TAG_SUGGESTIONS} max={10} disabled={locked} placeholder="e.g. Buying guide" />
              </Field>
              <Field label="Project" hint="Links the article to a project page.">
                <Select value={form.project_slug} placeholder="No project" options={WEBSITE_PROJECTS.map((p) => ({ value: p.slug, label: p.name }))} onChange={(e) => set("project_slug", e.target.value as ProjectSlug | "")} />
              </Field>
              <Field label="Author" hint="Leave empty to credit Best Builders & Developers.">
                <Input value={form.author_name} maxLength={120} placeholder="Best Builders & Developers" onChange={(e) => set("author_name", e.target.value)} />
              </Field>
              <Checkbox label="Feature on the home page" hint="Featured articles are shown first in the home page Articles section." checked={form.featured} disabled={locked || !published} onChange={(v) => set("featured", v)} />
            </div>
          </Card>

          <SeoCard form={form} set={set} url={article.url.replace(/[^/]+\/$/, `${form.slug}/`)} />

          <Card title="Danger zone">
            <Button variant="danger-outline" size="sm" disabled={published && !isAdmin} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete article
            </Button>
          </Card>
        </fieldset>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this article?"
        body={published ? "It is live on the website and will be removed at the next rebuild. Its images are deleted too." : "The draft and its images are deleted."}
        confirmLabel="Delete"
        danger
        pending={remove.pending}
        onConfirm={onDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

function CoverCard({ articleId, cover, alt, onCover, onAlt, disabled }: { articleId: string; cover: Cover | null; alt: string; onCover: (c: Cover | null) => void; onAlt: (v: string) => void; disabled?: boolean }) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  async function upload(file: File) {
    setUploading(true);
    try {
      const image = await uploadArticleImage(articleId, file);
      onCover(image);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  }
  return (
    <Card
      title="Cover image"
      actions={
        cover &&
        !disabled && (
          <Button size="sm" variant="ghost" onClick={() => onCover(null)}>
            Remove
          </Button>
        )
      }
    >
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => fileRef.current?.click()}
        className="group relative flex aspect-[1.91/1] w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted text-muted-foreground hover:border-primary disabled:cursor-not-allowed"
      >
        {cover ? (
          <img src={cover.thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs">
            <ImagePlus className="h-5 w-5" /> {uploading ? "Uploading…" : "Add a cover image"}
          </span>
        )}
        {cover && !disabled && <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100">{uploading ? "Uploading…" : "Replace"}</span>}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      <p className="mt-2 text-xs text-muted-foreground">Shown on cards, at the top of the article and when it is shared on WhatsApp or Facebook. Landscape works best.</p>
      {cover && (
        <Field label="Image description" className="mt-3" hint="For screen readers and Google Images.">
          <Input value={alt} maxLength={200} onChange={(e) => onAlt(e.target.value)} />
        </Field>
      )}
    </Card>
  );
}

function SeoCard({ form, set, url }: { form: Form; set: <K extends keyof Form>(key: K, value: Form[K]) => void; url: string }) {
  const title = form.seo_title || form.title;
  const description = form.seo_description || form.excerpt;
  return (
    <Card title="Search & sharing">
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-border p-3">
          <div className="label-caps mb-1.5">Google preview</div>
          <div className="truncate text-xs text-emerald-800">{url}</div>
          <div className="mt-0.5 line-clamp-1 text-base text-sky-800">{title ? `${title} | Best Builders & Developers` : "Article title"}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{description || "Add an excerpt or meta description so Google shows a summary."}</div>
        </div>
        <Field label="SEO title" hint={`${(form.seo_title || form.title).length}/60 recommended. Leave empty to use the title.`}>
          <Input value={form.seo_title} maxLength={120} placeholder={form.title} onChange={(e) => set("seo_title", e.target.value)} />
        </Field>
        <Field label="Meta description" hint={`${(form.seo_description || form.excerpt).length}/155 recommended. Leave empty to use the excerpt.`}>
          <Textarea rows={3} maxLength={320} value={form.seo_description} placeholder={form.excerpt} onChange={(e) => set("seo_description", e.target.value)} />
        </Field>
      </div>
    </Card>
  );
}

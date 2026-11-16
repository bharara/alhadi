import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ExternalLink, ImagePlus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { InferResponseType } from "hono/client";
import { crm, errorMessage, unwrap } from "@/lib/api";
import { QueryView, useAction, useQuery } from "@/lib/hooks";
import { WEBSITE_PROJECTS } from "@worker/website/fields";
import { Button } from "@/ui/button";
import { Checkbox, Field, Input, Select, TagsInput, Textarea } from "@/ui/form";
import { Badge, Card, ConfirmDialog, PageHeader } from "@/ui/layout";
import { cn } from "@/ui/cn";
import { MAX_PHOTOS } from "@worker/website/fields";
import { uploadPhoto } from "./photos";

type ListingDetail = InferResponseType<(typeof crm.listings)[":id"]["$get"], 200>;
type Photo = ListingDetail["photos"][number];
type ProjectSlug = (typeof WEBSITE_PROJECTS)[number]["slug"];

const FEATURE_SUGGESTIONS = ["Corner", "Park facing", "Main boulevard", "Possession ready", "50 ft road", "Near mosque", "Near commercial"];

type FormState = {
  title: string;
  slug: string;
  project_slug: ProjectSlug | "";
  summary: string;
  description: string;
  price_text: string;
  show_number: boolean;
  features: string[];
  featured: boolean;
  published: boolean;
  sort_order: number;
};

const formOf = (l: ListingDetail): FormState => ({
  title: l.title,
  slug: l.slug,
  project_slug: l.project_slug ?? "",
  summary: l.summary ?? "",
  description: l.description ?? "",
  price_text: l.price_text ?? "",
  show_number: l.show_number,
  features: l.features,
  featured: l.featured,
  published: l.published,
  sort_order: l.sort_order,
});

export function ListingEditorPage() {
  const { listingId = "" } = useParams();
  const listing = useQuery(() => unwrap(crm.listings[":id"].$get({ param: { id: listingId } })), listingId);
  const website = useQuery(() => unwrap(crm.website.$get()));
  const site = website.status === "ready" ? website.data.site_url.replace(/\/$/, "") : "";
  return (
    <QueryView query={listing}>
      {(data) => <ListingEditor key={data.id} listing={data} site={site} onChange={(next) => listing.setData(() => next)} />}
    </QueryView>
  );
}

function ListingEditor({ listing, site, onChange }: { listing: ListingDetail; site: string; onChange: (listing: ListingDetail) => void }) {
  const navigate = useNavigate();
  const [form, setForm] = React.useState<FormState>(() => formOf(listing));
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const save = useAction((json: FormState) =>
    unwrap(
      crm.listings[":id"].$patch({
        param: { id: listing.id },
        json: {
          ...json,
          project_slug: json.project_slug || null,
          summary: json.summary || null,
          description: json.description || null,
          price_text: json.price_text || null,
          sort_order: Number.isFinite(json.sort_order) ? Math.trunc(json.sort_order) : 0,
        },
      }),
    ),
  );
  const remove = useAction(() => unwrap(crm.listings[":id"].$delete({ param: { id: listing.id } })));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(listing));
  const disabled = !listing.can_edit;
  const item = listing.item;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = await save.run(form);
    if (!next) return;
    onChange(next);
    setForm(formOf(next));
    toast.success(next.published ? "Saved. The property page updates after the next site build (a few minutes)." : "Saved as draft");
  }

  async function onDelete() {
    if (await remove.run()) {
      toast.success("Listing deleted");
      navigate("/website");
    }
  }

  return (
    <form onSubmit={submit}>
      <PageHeader
        crumbs={
          <>
            <Link to="/website" className="hover:underline">Website listings</Link> /{" "}
            <Link to={`/inventory/${listing.inventory_item_id}`} className="hover:underline">Property</Link>
          </>
        }
        title={listing.title}
        lede={
          <span className="inline-flex flex-wrap items-center gap-2">
            {listing.published ? <Badge tone="gold">Published</Badge> : <Badge>Draft</Badge>}
            {item.status === "sold" && <Badge tone="danger">Sold</Badge>}
            {listing.published && site && (
              <a href={`${site}/properties/${listing.slug}/`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-foreground underline">
                View on site <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </span>
        }
        actions={
          listing.can_edit && (
            <>
              <Button variant="danger-outline" onClick={() => setConfirmDelete(true)}>
                Delete listing
              </Button>
              <Button type="submit" pending={save.pending} disabled={!dirty}>
                Save
              </Button>
            </>
          )
        }
      />

      {disabled && (
        <p className="mb-4 rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">Only admins or whoever entered this property can edit its listing.</p>
      )}

      <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        <Fact label="Type">{item.type_label}</Fact>
        <Fact label="Size">{item.size}</Fact>
        <Fact label="Block">{item.block ?? "—"}</Fact>
        <Fact label="Number">{item.house_number}</Fact>
        <Fact label="Status">{item.status === "sold" ? <Badge tone="danger">Sold</Badge> : <Badge tone="success">Available</Badge>}</Fact>
        <Fact label="Asking price (internal)">{item.asking_price ?? "—"}</Fact>
      </dl>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Listing">
            <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" required className="sm:col-span-2">
                <Input value={form.title} maxLength={160} onChange={(e) => set("title", e.target.value)} required />
              </Field>
              <Field label="Web address" className="sm:col-span-2" hint="Lowercase letters, numbers and hyphens. Changing it breaks links already shared.">
                <div className="flex min-w-0 items-stretch overflow-hidden rounded-md border border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
                  <span className="hidden shrink-0 items-center bg-muted px-3 text-xs text-muted-foreground sm:flex">{(site || "") + "/properties/"}</span>
                  <input
                    className="h-10 min-w-0 flex-1 bg-card px-3 text-sm outline-none disabled:bg-muted"
                    value={form.slug}
                    maxLength={120}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                    required
                  />
                </div>
              </Field>
              <Field label="Project page" hint="Also shows the listing on that project's page.">
                <Select
                  value={form.project_slug}
                  placeholder="No project page"
                  options={WEBSITE_PROJECTS.map((p) => ({ value: p.slug, label: p.name }))}
                  onChange={(e) => set("project_slug", e.target.value as ProjectSlug | "")}
                />
              </Field>
              <Field label="Price text" hint='Shown exactly as written, e.g. "Starting PKR 2.4 crore". Empty shows "Call for price".'>
                <Input value={form.price_text} maxLength={120} placeholder="Call for price" onChange={(e) => set("price_text", e.target.value)} />
              </Field>
              <Field label="Card text" className="sm:col-span-2" hint={`${form.summary.length}/300. Shown on listing cards.`}>
                <Textarea rows={2} maxLength={300} value={form.summary} onChange={(e) => set("summary", e.target.value)} />
              </Field>
              <Field label="Description" className="sm:col-span-2" hint="Shown on the property page. Leave a blank line between paragraphs.">
                <Textarea rows={8} maxLength={5000} value={form.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
              <Field label="Features" className="sm:col-span-2" hint="Short highlights, up to 20.">
                <TagsInput value={form.features} onChange={(v) => set("features", v.slice(0, 20))} suggestions={FEATURE_SUGGESTIONS} disabled={disabled} placeholder="e.g. Corner" />
              </Field>
            </fieldset>
          </Card>

          <PhotosCard listing={listing} disabled={disabled} onChange={(photos) => onChange({ ...listing, photos, photo_count: photos.length, cover: photos[0] ? { full: photos[0].full, thumb: photos[0].thumb } : null })} />
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Publishing">
            <div className="flex flex-col gap-3">
              <Checkbox label="Published" hint="Shows the listing and its page on the website." checked={form.published} disabled={disabled} onChange={(v) => set("published", v)} />
              <Checkbox label="Feature on home page" checked={form.featured} disabled={disabled} onChange={(v) => set("featured", v)} />
              <Checkbox label="Show plot / house number" hint={`No. ${item.house_number}`} checked={form.show_number} disabled={disabled} onChange={(v) => set("show_number", v)} />
              <Field label="Display order" hint="Lower numbers show first.">
                <Input type="number" value={form.sort_order} disabled={disabled} onChange={(e) => set("sort_order", Number(e.target.value))} className="max-w-[8rem]" />
              </Field>
              {dirty && <p className="text-xs text-amber-700">Unsaved changes.</p>}
            </div>
          </Card>
          <Preview form={form} listing={listing} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this listing?"
        body={`Its photos are deleted too${listing.published ? " and its page leaves the website after the next build" : ""}. The property itself stays in inventory.`}
        confirmLabel="Delete listing"
        danger
        pending={remove.pending}
        onConfirm={onDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </form>
  );
}

type UploadState = { name: string; status: "waiting" | "uploading" | "done" | "error"; error?: string };

function PhotosCard({ listing, disabled, onChange }: { listing: ListingDetail; disabled: boolean; onChange: (photos: Photo[]) => void }) {
  const photos = listing.photos;
  const [uploads, setUploads] = React.useState<UploadState[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [alts, setAlts] = React.useState<Record<string, string>>({});
  const [toDelete, setToDelete] = React.useState<Photo | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const uploading = uploads.some((u) => u.status === "uploading" || u.status === "waiting");
  const arrange = useAction((order: string[], altsChanged: Record<string, string>) =>
    unwrap(crm.listings[":id"].photos.$put({ param: { id: listing.id }, json: { order, alts: altsChanged } })),
  );
  const remove = useAction((photoId: string) => unwrap(crm.listings[":id"].photos[":photoId"].$delete({ param: { id: listing.id, photoId } })));
  const altsDirty = Object.entries(alts).some(([id, alt]) => (photos.find((p) => p.id === id)?.alt ?? "") !== alt);

  async function addFiles(fileList: FileList | File[]) {
    const files = [...fileList].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    const room = MAX_PHOTOS - photos.length;
    if (!files.length) return;
    if (room <= 0) return toast.error(`A listing can have at most ${MAX_PHOTOS} photos`);
    const batch = files.slice(0, room);
    if (files.length > room) toast.warning(`Only the first ${room} photos were added (max ${MAX_PHOTOS}).`);
    setUploads(batch.map((f) => ({ name: f.name, status: "waiting" })));
    let latest: Photo[] | null = null;
    for (const [index, file] of batch.entries()) {
      setUploads((u) => u.map((x, i) => (i === index ? { ...x, status: "uploading" } : x)));
      try {
        latest = await uploadPhoto(listing.id, file);
        onChange(latest);
        setUploads((u) => u.map((x, i) => (i === index ? { ...x, status: "done" } : x)));
      } catch (error) {
        setUploads((u) => u.map((x, i) => (i === index ? { ...x, status: "error", error: errorMessage(error) } : x)));
      }
    }
    if (latest) toast.success("Photos uploaded");
  }

  async function reorder(order: string[]) {
    const result = await arrange.run(order, {});
    if (result) onChange(result.photos);
  }

  const move = (index: number, to: number) => {
    const ids = photos.map((p) => p.id);
    const [id] = ids.splice(index, 1);
    ids.splice(to, 0, id!);
    void reorder(ids);
  };

  async function saveAlts() {
    const result = await arrange.run(
      photos.map((p) => p.id),
      alts,
    );
    if (result) {
      onChange(result.photos);
      setAlts({});
      toast.success("Descriptions saved");
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const result = await remove.run(toDelete.id);
    if (result) {
      onChange(result.photos);
      setToDelete(null);
    }
  }

  return (
    <Card
      title={`Photos (${photos.length}/${MAX_PHOTOS})`}
      actions={
        !disabled && (
          <>
            {altsDirty && (
              <Button size="sm" variant="outline" pending={arrange.pending} onClick={saveAlts}>
                Save descriptions
              </Button>
            )}
            <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading || photos.length >= MAX_PHOTOS}>
              <ImagePlus className="h-3.5 w-3.5" /> Add photos
            </Button>
          </>
        )
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {!disabled && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "mb-4 flex min-h-[88px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground",
            dragging && "border-primary bg-primary-muted/40",
          )}
        >
          <ImagePlus className="mb-1 h-5 w-5" />
          Drop photos here or tap to choose. They're resized in your browser before upload.
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="mb-4 flex flex-col gap-1 text-xs">
          {uploads.map((u, i) => (
            <li key={`${u.name}-${i}`} className="flex items-center justify-between gap-2">
              <span className="truncate">{u.name}</span>
              <span className={cn("shrink-0", u.status === "error" ? "text-destructive" : u.status === "done" ? "text-emerald-700" : "text-muted-foreground")}>
                {u.status === "waiting" ? "Waiting" : u.status === "uploading" ? "Uploading…" : u.status === "done" ? "Done" : u.error}
              </span>
            </li>
          ))}
        </ul>
      )}

      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos yet. The first photo becomes the cover and the preview when the page is shared.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="relative aspect-[4/3] bg-muted">
                <img src={photo.thumb} alt={photo.alt ?? ""} className="h-full w-full object-cover" loading="lazy" />
                {index === 0 && (
                  <span className="absolute left-2 top-2">
                    <Badge tone="gold">Cover</Badge>
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2 p-2">
                <Input
                  aria-label="Photo description"
                  placeholder="Describe the photo"
                  maxLength={200}
                  disabled={disabled}
                  value={alts[photo.id] ?? photo.alt ?? ""}
                  onChange={(e) => setAlts((a) => ({ ...a, [photo.id]: e.target.value }))}
                  className="h-9"
                />
                {!disabled && (
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label="Move earlier" disabled={index === 0 || arrange.pending} onClick={() => move(index, index - 1)} className="h-11 w-11">
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Move later" disabled={index === photos.length - 1 || arrange.pending} onClick={() => move(index, index + 1)} className="h-11 w-11">
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                      {index > 0 && (
                        <Button size="icon" variant="ghost" aria-label="Make cover" disabled={arrange.pending} onClick={() => move(index, 0)} className="h-11 w-11">
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Button size="icon" variant="ghost" aria-label="Delete photo" onClick={() => setToDelete(photo)} className="h-11 w-11 text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this photo?"
        body="It is removed from the listing and storage. This cannot be undone."
        confirmLabel="Delete photo"
        danger
        pending={remove.pending}
        onConfirm={() => void confirmDelete()}
        onClose={() => setToDelete(null)}
      />
    </Card>
  );
}

/** Roughly how the card looks on bestbuilderdeveloper.com. */
function Preview({ form, listing }: { form: FormState; listing: ListingDetail }) {
  const item = listing.item;
  const project = WEBSITE_PROJECTS.find((p) => p.slug === form.project_slug);
  const facts = [item.size, item.block && `Block ${item.block}`, form.show_number && `No. ${item.house_number}`].filter(Boolean).join(" · ");
  const cover = listing.photos[0];
  return (
    <Card title="Card preview">
      <div className={cn("overflow-hidden rounded-lg bg-[#070707] text-[#f2ede4]", !form.published && "opacity-60")}>
        {cover ? <img src={cover.thumb} alt="" className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center text-xs text-[#9a958b]">No cover photo</div>}
        <div className="p-5">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9a958b]">
            {item.type_label}
            {project ? ` · ${project.name}` : ""}
          </div>
          <h3 className="mt-2 text-lg font-bold uppercase leading-tight">{form.title || "Title"}</h3>
          <p className="mt-1 text-sm text-[#cfc8bb]">{facts}</p>
          {form.summary && <p className="mt-2 text-sm leading-relaxed text-[#9a958b]">{form.summary}</p>}
          <p className="mt-4 text-lg font-semibold text-[#e7c27a]">{form.price_text || "Call for price"}</p>
          <p className="mt-2 text-sm font-semibold text-[#f3dcae]">View details →</p>
        </div>
      </div>
      {!form.published && <p className="mt-2 text-xs text-muted-foreground">Draft: not on the website.</p>}
      {item.status === "sold" && <p className="mt-2 text-xs text-muted-foreground">The property is sold, so the site hides it unless "keep sold listings" is on.</p>}
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3">
      <dt className="label-caps">{label}</dt>
      <dd className="mt-1 truncate text-sm">{children}</dd>
    </div>
  );
}

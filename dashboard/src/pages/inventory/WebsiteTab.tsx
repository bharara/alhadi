import React from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { crm, errorMessage, unwrap, type InventoryItem } from "@/lib/api";
import { dataOr, useAction, useQuery } from "@/lib/hooks";
import type { InferResponseType } from "hono/client";
import { INVENTORY_TYPE_LABELS, MAX_PHOTOS, WEBSITE_PROJECTS } from "@worker/inventory/fields";
import { Button } from "@/ui/button";
import { Checkbox, Field, Input, Select, TagsInput, Textarea } from "@/ui/form";
import { Badge, Card, ConfirmDialog } from "@/ui/layout";
import { cn } from "@/ui/cn";
import { uploadPhoto } from "./photos";

type Photo = InferResponseType<(typeof crm.inventory)[":id"]["photos"]["$get"], 200>["photos"][number];
type ProjectSlug = (typeof WEBSITE_PROJECTS)[number]["slug"];

const FEATURE_SUGGESTIONS = ["Corner", "Park facing", "Main boulevard", "Possession ready", "50 ft road", "Near mosque", "Near commercial"];

type WebForm = {
  published: boolean;
  featured: boolean;
  project_slug: ProjectSlug | "";
  web_title: string;
  slug: string;
  web_summary: string;
  web_description: string;
  web_price: string;
  show_number: boolean;
  web_features: string[];
  web_order: number;
};

const formOf = (item: InventoryItem): WebForm => ({
  published: item.published,
  featured: item.featured,
  project_slug: item.project_slug ?? "",
  web_title: item.web_title ?? "",
  slug: item.slug ?? "",
  web_summary: item.web_summary ?? "",
  web_description: item.web_description ?? "",
  web_price: item.web_price ?? "",
  show_number: item.show_number,
  web_features: item.web_features,
  web_order: item.web_order,
});

// Only changed fields are sent, so the Worker can fill in a project and web address when publishing.
function changesOf(form: WebForm, saved: WebForm) {
  const changed = (Object.keys(form) as (keyof WebForm)[]).filter((key) => JSON.stringify(form[key]) !== JSON.stringify(saved[key]));
  const pick = <K extends keyof WebForm>(key: K) => (changed.includes(key) ? form[key] : undefined);
  return {
    published: pick("published"),
    featured: pick("featured"),
    project_slug: changed.includes("project_slug") ? form.project_slug || null : undefined,
    web_title: pick("web_title"),
    slug: pick("slug") || undefined,
    web_summary: pick("web_summary"),
    web_description: pick("web_description"),
    web_price: pick("web_price"),
    show_number: pick("show_number"),
    web_features: pick("web_features"),
    web_order: changed.includes("web_order") ? (Number.isFinite(form.web_order) ? Math.trunc(form.web_order) : 0) : undefined,
  };
}

export function WebsiteTab({ item, site, onChange }: { item: InventoryItem; site: string; onChange: (item: InventoryItem) => void }) {
  const [form, setForm] = React.useState<WebForm>(() => formOf(item));
  const photos = useQuery(() => unwrap(crm.inventory[":id"].photos.$get({ param: { id: item.id } })).then((r) => r.photos), item.id);
  const disabled = !item.can_edit;
  const set = <K extends keyof WebForm>(key: K, value: WebForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(item));
  const save = useAction((web: WebForm) => unwrap(crm.inventory[":id"].$patch({ param: { id: item.id }, json: changesOf(web, formOf(item)) })));
  const refresh = async (next: Photo[]) => {
    photos.setData(() => next);
    onChange(await unwrap(crm.inventory[":id"].$get({ param: { id: item.id } })));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = await save.run(form);
    if (!next) return;
    onChange(next);
    setForm(formOf(next));
    toast.success(next.published ? "Saved. The website updates after the automatic rebuild (a few minutes)." : "Saved. Not on the website.");
  }

  return (
    <form onSubmit={submit} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card
          title="Website page"
          actions={
            !disabled && (
              <Button type="submit" size="sm" pending={save.pending} disabled={!dirty}>
                Save website
              </Button>
            )
          }
        >
          <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" className="sm:col-span-2" hint="Leave empty to use the suggested title.">
              <Input value={form.web_title} maxLength={160} placeholder={item.auto_title} onChange={(e) => set("web_title", e.target.value)} />
            </Field>
            <Field label="Web address" className="sm:col-span-2" hint="Filled in when you publish. Changing it later breaks links already shared.">
              <div className="flex min-w-0 items-stretch overflow-hidden rounded-md border border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
                <span className="hidden shrink-0 items-center bg-muted px-3 text-xs text-muted-foreground sm:flex">{`${site}/properties/`}</span>
                <input
                  className="h-10 min-w-0 flex-1 bg-card px-3 text-sm outline-none disabled:bg-muted"
                  value={form.slug}
                  maxLength={120}
                  placeholder="generated-on-publish"
                  onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                />
              </div>
            </Field>
            <Field label="Project page" hint="Also shows the property on that project's page.">
              <Select
                value={form.project_slug}
                placeholder="No project page"
                options={WEBSITE_PROJECTS.map((p) => ({ value: p.slug, label: p.name }))}
                onChange={(e) => set("project_slug", e.target.value as ProjectSlug | "")}
              />
            </Field>
            <Field label="Price text" hint='Shown exactly as written, e.g. "Starting PKR 2.4 crore".'>
              <Input value={form.web_price} maxLength={120} placeholder="Call for price" onChange={(e) => set("web_price", e.target.value)} />
            </Field>
            <Field label="Card text" className="sm:col-span-2" hint={`${form.web_summary.length}/300. Shown on property cards.`}>
              <Textarea rows={2} maxLength={300} value={form.web_summary} onChange={(e) => set("web_summary", e.target.value)} />
            </Field>
            <Field label="Description" className="sm:col-span-2" hint="Shown on the property page. Leave a blank line between paragraphs.">
              <Textarea rows={8} maxLength={5000} value={form.web_description} onChange={(e) => set("web_description", e.target.value)} />
            </Field>
            <Field label="Features" className="sm:col-span-2" hint="Short highlights, up to 20.">
              <TagsInput value={form.web_features} onChange={(v) => set("web_features", v.slice(0, 20))} suggestions={FEATURE_SUGGESTIONS} disabled={disabled} placeholder="e.g. Corner" />
            </Field>
          </fieldset>
        </Card>

        <PhotosCard propertyId={item.id} photos={dataOr(photos, [])} disabled={disabled} onChange={(next) => void refresh(next)} />
      </div>

      <div className="flex flex-col gap-4">
        <Card title="Publishing">
          <div className="flex flex-col gap-3">
            <Checkbox label="Show on website" hint="Gives the property its own page and lists it on the site." checked={form.published} disabled={disabled} onChange={(v) => set("published", v)} />
            <Checkbox label="Feature on home page" checked={form.featured} disabled={disabled} onChange={(v) => set("featured", v)} />
            <Checkbox label="Show plot / house number" hint={`No. ${item.house_number}`} checked={form.show_number} disabled={disabled} onChange={(v) => set("show_number", v)} />
            <Field label="Display order" hint="Lower numbers show first. You can also reorder on the Website page.">
              <Input type="number" value={form.web_order} disabled={disabled} onChange={(e) => set("web_order", Number(e.target.value))} className="max-w-[8rem]" />
            </Field>
            {dirty && <p className="text-xs text-amber-700">Unsaved changes.</p>}
          </div>
        </Card>
        <Preview form={form} item={item} cover={dataOr(photos, [])[0]} />
      </div>
    </form>
  );
}

type UploadState = { name: string; status: "waiting" | "uploading" | "done" | "error"; error?: string };

function PhotosCard({ propertyId, photos, disabled, onChange }: { propertyId: string; photos: Photo[]; disabled: boolean; onChange: (photos: Photo[]) => void }) {
  const [uploads, setUploads] = React.useState<UploadState[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [alts, setAlts] = React.useState<Record<string, string>>({});
  const [toDelete, setToDelete] = React.useState<Photo | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const uploading = uploads.some((u) => u.status === "uploading" || u.status === "waiting");
  const arrange = useAction((order: string[], altsChanged: Record<string, string>) =>
    unwrap(crm.inventory[":id"].photos.$put({ param: { id: propertyId }, json: { order, alts: altsChanged } })),
  );
  const remove = useAction((photoId: string) => unwrap(crm.inventory[":id"].photos[":photoId"].$delete({ param: { id: propertyId, photoId } })));
  const altsDirty = Object.entries(alts).some(([id, alt]) => (photos.find((p) => p.id === id)?.alt ?? "") !== alt);

  async function addFiles(fileList: FileList | File[]) {
    const files = [...fileList].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    const room = MAX_PHOTOS - photos.length;
    if (!files.length) return;
    if (room <= 0) return toast.error(`A property can have at most ${MAX_PHOTOS} photos`);
    const batch = files.slice(0, room);
    if (files.length > room) toast.warning(`Only the first ${room} photos were added (max ${MAX_PHOTOS}).`);
    setUploads(batch.map((f) => ({ name: f.name, status: "waiting" })));
    let latest: Photo[] | null = null;
    for (const [index, file] of batch.entries()) {
      setUploads((u) => u.map((x, i) => (i === index ? { ...x, status: "uploading" } : x)));
      try {
        latest = await uploadPhoto(propertyId, file);
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
        body="It is removed from the property and from storage. This cannot be undone."
        confirmLabel="Delete photo"
        danger
        pending={remove.pending}
        onConfirm={() => void confirmDelete()}
        onClose={() => setToDelete(null)}
      />
    </Card>
  );
}

function Preview({ form, item, cover }: { form: WebForm; item: InventoryItem; cover: Photo | undefined }) {
  const project = WEBSITE_PROJECTS.find((p) => p.slug === form.project_slug);
  const facts = [item.size, item.block && `Block ${item.block}`, form.show_number && `No. ${item.house_number}`].filter(Boolean).join(" · ");
  return (
    <Card title="Card preview">
      <div className={cn("overflow-hidden rounded-lg bg-[#070707] text-[#f2ede4]", !form.published && "opacity-60")}>
        {cover ? <img src={cover.thumb} alt="" className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center text-xs text-[#9a958b]">No cover photo</div>}
        <div className="p-5">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9a958b]">
            {INVENTORY_TYPE_LABELS[item.type]}
            {project ? ` · ${project.name}` : ""}
          </div>
          <h3 className="mt-2 text-lg font-bold uppercase leading-tight">{form.web_title || item.auto_title}</h3>
          <p className="mt-1 text-sm text-[#cfc8bb]">{facts}</p>
          {form.web_summary && <p className="mt-2 text-sm leading-relaxed text-[#9a958b]">{form.web_summary}</p>}
          <p className="mt-4 text-lg font-semibold text-[#e7c27a]">{form.web_price || "Call for price"}</p>
          <p className="mt-2 text-sm font-semibold text-[#f3dcae]">View details →</p>
        </div>
      </div>
      {!form.published && <p className="mt-2 text-xs text-muted-foreground">Not on the website.</p>}
      {item.status === "sold" && <p className="mt-2 text-xs text-muted-foreground">Sold, so the site hides it unless "show sold" is on.</p>}
    </Card>
  );
}

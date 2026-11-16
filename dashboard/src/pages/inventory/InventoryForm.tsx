import { Lock } from "lucide-react";
import type { InventoryItem } from "@/lib/api";
import { CONTACT_KINDS, INVENTORY_STATUSES, INVENTORY_TYPE_LABELS, INVENTORY_TYPES, WEBSITE_PROJECTS } from "@/lib/labels";
import { Checkbox, Field, Input, Select, Textarea } from "@/ui/form";
import { Badge, Card } from "@/ui/layout";

type InventoryType = (typeof INVENTORY_TYPES)[number];
type ProjectSlug = (typeof WEBSITE_PROJECTS)[number]["slug"];

export type InventoryFormState = {
  house_number: string;
  block: string;
  town: string;
  type: InventoryType;
  status: (typeof INVENTORY_STATUSES)[number];
  size: string;
  details: string;
  asking_price: string;
  contact_name: string;
  contact_kind: (typeof CONTACT_KINDS)[number];
  contact_phone_number: string;
  project_slug: ProjectSlug | "";
  published: boolean;
  featured: boolean;
  show_price: boolean;
  show_number: boolean;
  public_title: string;
  public_details: string;
  website_order: number;
};

export const EMPTY_INVENTORY_FORM: InventoryFormState = {
  house_number: "",
  block: "",
  town: "",
  type: "residential_plot",
  status: "available",
  size: "",
  details: "",
  asking_price: "",
  contact_name: "",
  contact_kind: "direct",
  contact_phone_number: "",
  project_slug: "",
  published: false,
  featured: false,
  show_price: false,
  show_number: false,
  public_title: "",
  public_details: "",
  website_order: 0,
};

export function formFromItem(item: InventoryItem): InventoryFormState {
  return {
    house_number: item.house_number,
    block: item.block ?? "",
    town: item.town,
    type: item.type,
    status: item.status,
    size: item.size,
    details: item.details ?? "",
    asking_price: item.asking_price ?? "",
    contact_name: item.contact_name,
    contact_kind: item.contact_kind,
    contact_phone_number: item.contact_phone_number,
    project_slug: item.project_slug ?? "",
    published: item.published,
    featured: item.featured,
    show_price: item.show_price,
    show_number: item.show_number,
    public_title: item.public_title ?? "",
    public_details: item.public_details ?? "",
    website_order: item.website_order,
  };
}

/** The JSON body for create and update. */
export function payloadFromForm(form: InventoryFormState) {
  return {
    ...form,
    block: form.block || null,
    details: form.details || null,
    asking_price: form.asking_price || null,
    project_slug: form.project_slug || null,
    public_title: form.public_title || null,
    public_details: form.public_details || null,
    website_order: Number.isFinite(form.website_order) ? Math.trunc(form.website_order) : 0,
  };
}

export const autoTitle = (form: Pick<InventoryFormState, "size" | "type">) =>
  `${form.size || "Size"} ${INVENTORY_TYPE_LABELS[form.type].toLowerCase()}`;

const options = <T extends string>(values: readonly T[], label: (v: T) => string) => values.map((value) => ({ value, label: label(value) }));
const capitalize = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

export function InventoryForm({
  form,
  onChange,
  towns,
  disabled,
}: {
  form: InventoryFormState;
  onChange: (form: InventoryFormState) => void;
  towns: string[];
  disabled?: boolean;
}) {
  const set = <K extends keyof InventoryFormState>(key: K, value: InventoryFormState[K]) => onChange({ ...form, [key]: value });
  const townsId = "inventory-towns";

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <div className="flex flex-col gap-4">
        <Card title="Property">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="House / plot number" required>
              <Input value={form.house_number} disabled={disabled} onChange={(e) => set("house_number", e.target.value)} required />
            </Field>
            <Field label="Block">
              <Input value={form.block} disabled={disabled} onChange={(e) => set("block", e.target.value)} />
            </Field>
            <Field label="Town" required>
              <Input list={townsId} value={form.town} disabled={disabled} onChange={(e) => set("town", e.target.value)} required />
              <datalist id={townsId}>
                {towns.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Type" required>
              <Select value={form.type} disabled={disabled} options={options(INVENTORY_TYPES, (t) => INVENTORY_TYPE_LABELS[t])} onChange={(e) => set("type", e.target.value as InventoryType)} />
            </Field>
            <Field label="Status" required>
              <Select value={form.status} disabled={disabled} options={options(INVENTORY_STATUSES, capitalize)} onChange={(e) => set("status", e.target.value as InventoryFormState["status"])} />
            </Field>
            <Field label="Size" required>
              <Input placeholder="e.g. 1 Kanal" value={form.size} disabled={disabled} onChange={(e) => set("size", e.target.value)} required />
            </Field>
            <Field label="Asking price" className="sm:col-span-2">
              <Input placeholder="e.g. PKR 2.4 Cr" value={form.asking_price} disabled={disabled} onChange={(e) => set("asking_price", e.target.value)} />
            </Field>
            <Field label="Details" className="sm:col-span-2" hint="Internal notes. Not shown on the website.">
              <Textarea rows={5} value={form.details} disabled={disabled} onChange={(e) => set("details", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card
          title={
            <span className="inline-flex items-center gap-2">
              Owner contact <Badge tone="neutral"><Lock className="mr-1 h-3 w-3" />Private</Badge>
            </span>
          }
        >
          <p className="mb-4 text-xs text-muted-foreground">Only the dashboard team sees this. It is never shown on the website.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact name" required>
              <Input value={form.contact_name} disabled={disabled} onChange={(e) => set("contact_name", e.target.value)} required />
            </Field>
            <Field label="Direct / indirect" required>
              <Select value={form.contact_kind} disabled={disabled} options={options(CONTACT_KINDS, capitalize)} onChange={(e) => set("contact_kind", e.target.value as InventoryFormState["contact_kind"])} />
            </Field>
            <Field label="Phone number" required className="sm:col-span-2">
              <Input type="tel" value={form.contact_phone_number} disabled={disabled} onChange={(e) => set("contact_phone_number", e.target.value)} required />
            </Field>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card title="Website">
          <div className="flex flex-col gap-4">
            <Field label="Project page" hint="Shows the listing on that project's page. Leave empty to show it on the home page only.">
              <Select
                value={form.project_slug}
                disabled={disabled}
                placeholder="No project page"
                options={WEBSITE_PROJECTS.map((p) => ({ value: p.slug, label: p.name }))}
                onChange={(e) => set("project_slug", e.target.value as ProjectSlug | "")}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Checkbox label="Show on website" checked={form.published} disabled={disabled} onChange={(v) => set("published", v)} />
              <Checkbox label="Feature on home page" checked={form.featured} disabled={disabled} onChange={(v) => set("featured", v)} />
              <Checkbox label="Show price" hint={form.asking_price ? undefined : "Add an asking price first"} checked={form.show_price} disabled={disabled} onChange={(v) => set("show_price", v)} />
              <Checkbox label="Show plot / house number" checked={form.show_number} disabled={disabled} onChange={(v) => set("show_number", v)} />
            </div>
            <Field label="Public title">
              <Input placeholder={autoTitle(form)} value={form.public_title} disabled={disabled} onChange={(e) => set("public_title", e.target.value)} />
            </Field>
            <Field label="Public details" hint="A short line buyers see, e.g. corner, park facing, possession.">
              <Textarea rows={3} maxLength={2000} value={form.public_details} disabled={disabled} onChange={(e) => set("public_details", e.target.value)} />
            </Field>
            <Field label="Display order" hint="Lower numbers show first.">
              <Input type="number" value={form.website_order} disabled={disabled} onChange={(e) => set("website_order", Number(e.target.value))} className="max-w-[10rem]" />
            </Field>
          </div>
        </Card>
        <ListingPreview form={form} />
      </div>
    </div>
  );
}

/** Roughly how the listing card looks on bestbuilderdeveloper.com. */
export function ListingPreview({ form }: { form: InventoryFormState }) {
  const project = WEBSITE_PROJECTS.find((p) => p.slug === form.project_slug);
  const price = form.show_price && form.asking_price ? form.asking_price : "Call for price";
  const location = [form.block && `Block ${form.block}`, form.show_number && form.house_number && `No. ${form.house_number}`].filter(Boolean).join(" · ");
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Website preview</h2>
        {form.published ? <Badge tone="success">On website</Badge> : <Badge>Hidden</Badge>}
      </div>
      <div className="p-4">
        <div className={`rounded-lg bg-[#0e0e0d] p-5 text-[#f4efe6] ${form.published ? "" : "opacity-50"}`}>
          <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.2em] text-[#a39d91]">
            <span>{INVENTORY_TYPE_LABELS[form.type]}</span>
            {form.status === "sold" ? <span className="text-rose-300">Sold</span> : form.featured ? <span className="text-[#e7c27a]">Featured</span> : null}
          </div>
          <h3 className="mt-3 text-xl font-semibold text-[#e7c27a]">{form.public_title || autoTitle(form)}</h3>
          {project && <p className="mt-1 text-sm text-[#cfc8bb]">{project.name}</p>}
          {location && <p className="mt-1 text-sm text-[#a39d91]">{location}</p>}
          {form.public_details && <p className="mt-3 text-sm leading-relaxed text-[#cfc8bb]">{form.public_details}</p>}
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3 text-sm">
            <span className="font-semibold">{price}</span>
            <span className="text-[#e7c27a]">Ask on WhatsApp →</span>
          </div>
        </div>
        {!form.published && <p className="mt-2 text-xs text-muted-foreground">Turn on "Show on website" to list it.</p>}
      </div>
    </section>
  );
}

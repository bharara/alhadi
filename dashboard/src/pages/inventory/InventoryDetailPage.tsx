import React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { crm, unwrap, type InventoryItem } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { dataOr, QueryView, useAction, useQuery } from "@/lib/hooks";
import { INVENTORY_TYPE_LABELS } from "@worker/inventory/fields";
import { Button } from "@/ui/button";
import { Badge, ConfirmDialog, PageHeader } from "@/ui/layout";
import { cn } from "@/ui/cn";
import { formFromItem, InventoryForm, payloadFromForm, type InventoryFormState } from "./InventoryForm";
import { WebsiteTab } from "./WebsiteTab";

const TABS = [
  { value: "details", label: "Details" },
  { value: "website", label: "Website" },
] as const;

export function InventoryDetailPage() {
  const { inventoryId = "" } = useParams();
  const query = useQuery(() => unwrap(crm.inventory[":id"].$get({ param: { id: inventoryId } })), inventoryId);
  const towns = useQuery(() => unwrap(crm.inventory.towns.$get()).then((r) => r.towns));
  const website = useQuery(() => unwrap(crm.website.$get()));
  const site = website.status === "ready" ? website.data.site_url.replace(/\/$/, "") : "";
  return (
    <QueryView query={query}>
      {(item) => <PropertyDetail key={item.id} item={item} towns={dataOr(towns, [])} site={site} onChange={(next) => query.setData(() => next)} />}
    </QueryView>
  );
}

function PropertyDetail({ item, towns, site, onChange }: { item: InventoryItem; towns: string[]; site: string; onChange: (item: InventoryItem) => void }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "website" ? "website" : "details";
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const remove = useAction(() => unwrap(crm.inventory[":id"].$delete({ param: { id: item.id } })));

  async function onDelete() {
    if (await remove.run()) {
      toast.success("Property removed");
      navigate("/inventory");
    }
  }

  return (
    <>
      <PageHeader
        crumbs={<Link to="/inventory" className="hover:underline">Properties</Link>}
        title={`${item.house_number}${item.block ? `, Block ${item.block}` : ""}`}
        lede={`${INVENTORY_TYPE_LABELS[item.type]} in ${item.town}`}
        actions={
          <>
            {item.published && item.slug && site && (
              <a
                href={`${site}/properties/${item.slug}/`}
                target="_blank"
                rel="noopener"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm hover:bg-muted"
              >
                <ExternalLink className="h-4 w-4" /> View on site
              </a>
            )}
            {item.can_edit && (
              <Button variant="danger-outline" onClick={() => setConfirmDelete(true)}>
                Remove property
              </Button>
            )}
          </>
        }
      />

      {!item.can_edit && (
        <p className="mb-4 rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Only admins or {item.entered_by_username ?? "the person who added it"} can edit this property.
        </p>
      )}

      <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        <Summary label="Status">
          <Badge tone={item.status === "available" ? "success" : "neutral"}>{item.status === "available" ? "Available" : "Sold"}</Badge>
        </Summary>
        <Summary label="Website">
          {item.published ? <Badge tone="gold">{item.featured ? "Published · featured" : "Published"}</Badge> : <span className="text-muted-foreground">Not on website</span>}
        </Summary>
        <Summary label="Entered by">{item.entered_by_username ?? "—"}</Summary>
        <Summary label="Contact">{item.contact_name}</Summary>
        <Summary label="Phone">
          <a href={`tel:${item.contact_phone_number}`} className="hover:underline">
            {item.contact_phone_number}
          </a>
        </Summary>
        <Summary label="Updated">{formatWhen(item.updated_at ?? item.created_at)}</Summary>
      </dl>

      <div role="tablist" aria-label="Property sections" className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setParams(t.value === "details" ? {} : { tab: t.value }, { replace: true })}
            className={cn(
              "-mb-px min-h-11 border-b-2 px-4 text-sm font-medium",
              tab === t.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Both tabs stay mounted so switching never drops unsaved edits. */}
      <div hidden={tab !== "details"}>
        <DetailsTab item={item} towns={towns} onChange={onChange} />
      </div>
      <div hidden={tab !== "website"}>
        <WebsiteTab item={item} site={site} onChange={onChange} />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Remove this property?"
        body={item.published ? "Its photos are removed and its page leaves the website after the next rebuild. This cannot be undone." : "Its photos are removed too. This cannot be undone."}
        confirmLabel="Remove property"
        danger
        pending={remove.pending}
        onConfirm={onDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

function DetailsTab({ item, towns, onChange }: { item: InventoryItem; towns: string[]; onChange: (item: InventoryItem) => void }) {
  const [form, setForm] = React.useState<InventoryFormState>(() => formFromItem(item));
  const save = useAction((body: InventoryFormState) => unwrap(crm.inventory[":id"].$patch({ param: { id: item.id }, json: payloadFromForm(body) })));
  const dirty = JSON.stringify(form) !== JSON.stringify(formFromItem(item));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = await save.run(form);
    if (next) {
      onChange(next);
      setForm(formFromItem(next));
      toast.success(next.published ? "Saved. The website updates after the automatic rebuild." : "Saved");
    }
  }

  return (
    <form onSubmit={submit}>
      <InventoryForm form={form} onChange={setForm} towns={towns} disabled={!item.can_edit} />
      {item.can_edit && (
        <div className="mt-4 flex justify-end">
          <Button type="submit" pending={save.pending} disabled={!dirty}>
            Save details
          </Button>
        </div>
      )}
    </form>
  );
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3">
      <dt className="label-caps">{label}</dt>
      <dd className="mt-1 truncate text-sm">{children}</dd>
    </div>
  );
}

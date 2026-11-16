import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, Globe, Plus } from "lucide-react";
import { toast } from "sonner";
import { crm, unwrap, type InventoryItem } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { QueryView, useAction, useQuery } from "@/lib/hooks";
import { INVENTORY_TYPE_LABELS } from "@/lib/labels";
import { Button } from "@/ui/button";
import { Badge, Card, ConfirmDialog, PageHeader } from "@/ui/layout";
import { formFromItem, InventoryForm, payloadFromForm, type InventoryFormState } from "./InventoryForm";

export function InventoryDetailPage() {
  const { inventoryId = "" } = useParams();
  const query = useQuery(() => unwrap(crm.inventory[":id"].$get({ param: { id: inventoryId } })), inventoryId);
  const towns = useQuery(() => unwrap(crm.inventory.towns.$get()).then((r) => r.towns));
  return (
    <QueryView query={query}>
      {(item) => <InventoryDetail key={item.id} item={item} towns={towns.status === "ready" ? towns.data : []} onSaved={(next) => query.setData(() => next)} />}
    </QueryView>
  );
}

function InventoryDetail({ item, towns, onSaved }: { item: InventoryItem; towns: string[]; onSaved: (item: InventoryItem) => void }) {
  const navigate = useNavigate();
  const [form, setForm] = React.useState<InventoryFormState>(() => formFromItem(item));
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const save = useAction((body: InventoryFormState) => unwrap(crm.inventory[":id"].$patch({ param: { id: item.id }, json: payloadFromForm(body) })));
  const remove = useAction(() => unwrap(crm.inventory[":id"].$delete({ param: { id: item.id } })));
  const dirty = JSON.stringify(form) !== JSON.stringify(formFromItem(item));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = await save.run(form);
    if (next) {
      onSaved(next);
      setForm(formFromItem(next));
      toast.success(next.listing?.published ? "Saved. The website listing updates shortly." : "Saved");
    }
  }

  async function onDelete() {
    if (await remove.run()) {
      toast.success("Item removed");
      navigate("/inventory");
    }
  }

  return (
    <form onSubmit={submit}>
      <PageHeader
        crumbs={<Link to="/inventory" className="hover:underline">Inventory</Link>}
        title={`${item.house_number}${item.block ? `, Block ${item.block}` : ""}`}
        lede={`${INVENTORY_TYPE_LABELS[item.type]} in ${item.town}`}
        actions={
          item.can_edit && (
            <>
              <Button variant="danger-outline" onClick={() => setConfirmDelete(true)}>
                Remove item
              </Button>
              <Button type="submit" pending={save.pending} disabled={!dirty}>
                Save changes
              </Button>
            </>
          )
        }
      />

      {!item.can_edit && (
        <p className="mb-4 rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Only admins or {item.entered_by_username ?? "the person who added it"} can edit this item.
        </p>
      )}

      <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        <Summary label="Status">
          <Badge tone={item.status === "available" ? "success" : "neutral"}>{item.status === "available" ? "Available" : "Sold"}</Badge>
        </Summary>
        <Summary label="Website">
          {item.listing ? item.listing.published ? <Badge tone="gold">Published</Badge> : <Badge>Draft</Badge> : <span className="text-muted-foreground">Not listed</span>}
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

      <InventoryForm form={form} onChange={setForm} towns={towns} disabled={!item.can_edit} />

      <WebsiteListingCard item={item} />

      <ConfirmDialog
        open={confirmDelete}
        title="Remove this item?"
        body={item.listing ? "Its website listing and photos are removed too. This cannot be undone." : "This cannot be undone."}
        confirmLabel="Remove item"
        danger
        pending={remove.pending}
        onConfirm={onDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </form>
  );
}

/** The property's public listing: the curated version of this item on bestbuilderdeveloper.com. */
function WebsiteListingCard({ item }: { item: InventoryItem }) {
  const navigate = useNavigate();
  const website = useQuery(() => unwrap(crm.website.$get()));
  const create = useAction(() => unwrap(crm.listings.$post({ json: { inventory_item_id: item.id } })));
  const site = website.status === "ready" ? website.data.site_url.replace(/\/$/, "") : "";
  const listing = item.listing;

  async function onCreate() {
    const created = await create.run();
    if (created) {
      toast.success("Draft listing created");
      navigate(`/website/listings/${created.id}`);
    }
  }

  return (
    <Card
      className="mt-4"
      title={
        <span className="inline-flex items-center gap-2">
          <Globe className="h-4 w-4" /> Website listing
        </span>
      }
    >
      {listing ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {listing.published ? <Badge tone="gold">Published</Badge> : <Badge>Draft</Badge>}
              {item.status === "sold" && <Badge tone="danger">Sold</Badge>}
            </div>
            <p className="mt-1.5 truncate text-sm text-muted-foreground">/properties/{listing.slug}/</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {listing.published && site && (
              <a
                href={`${site}/properties/${listing.slug}/`}
                target="_blank"
                rel="noopener"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm hover:bg-muted"
              >
                <ExternalLink className="h-4 w-4" /> View on site
              </a>
            )}
            <Link to={`/website/listings/${listing.id}`} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
              Edit listing
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Not on the website. A listing has its own title, price text, description and photos; owner details and internal notes stay private.
          </p>
          {item.can_edit && (
            <Button variant="outline" pending={create.pending} onClick={onCreate}>
              <Plus className="h-4 w-4" /> Create website listing
            </Button>
          )}
        </div>
      )}
    </Card>
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

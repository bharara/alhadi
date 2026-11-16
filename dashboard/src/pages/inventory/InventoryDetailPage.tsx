import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { crm, unwrap, type InventoryItem } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { QueryView, useAction, useQuery } from "@/lib/hooks";
import { INVENTORY_TYPE_LABELS } from "@/lib/labels";
import { Button } from "@/ui/button";
import { Badge, ConfirmDialog, PageHeader } from "@/ui/layout";
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
      toast.success(next.published ? "Saved. The website updates within a minute." : "Saved");
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
        <Summary label="Website">{item.published ? <Badge tone="gold">On website</Badge> : <span className="text-muted-foreground">Hidden</span>}</Summary>
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

      <ConfirmDialog
        open={confirmDelete}
        title="Remove this item?"
        body={item.published ? "It will also disappear from the website. This cannot be undone." : "This cannot be undone."}
        confirmLabel="Remove item"
        danger
        pending={remove.pending}
        onConfirm={onDelete}
        onClose={() => setConfirmDelete(false)}
      />
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

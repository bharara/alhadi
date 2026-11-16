import React from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { crm, unwrap } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { QueryView, useAction, useQuery, useSearchState } from "@/lib/hooks";
import { INVENTORY_STATUSES, INVENTORY_TYPE_LABELS, INVENTORY_TYPES } from "@worker/inventory/fields";
import { WEBSITE_PROJECTS } from "@worker/website/fields";
import { Button } from "@/ui/button";
import { Input, Select } from "@/ui/form";
import { Badge, Card, Dialog, EmptyState, PageHeader, Pagination } from "@/ui/layout";
import { Table, Td, Th, Tr } from "@/ui/table";
import { cn } from "@/ui/cn";
import { EMPTY_INVENTORY_FORM, InventoryForm, payloadFromForm, type InventoryFormState } from "./InventoryForm";

const PAGE_SIZE = 25;
type FilterKey = "q" | "town" | "block" | "type" | "status" | "project" | "web" | "page";
type InventoryType = (typeof INVENTORY_TYPES)[number];
type InventoryStatus = (typeof INVENTORY_STATUSES)[number];
type ProjectSlug = (typeof WEBSITE_PROJECTS)[number]["slug"];

export function InventoryPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useSearchState<FilterKey>();
  const [draft, setDraft] = React.useState(filters);
  const [adding, setAdding] = React.useState(false);
  const page = Math.max(1, Number(filters.page) || 1);
  React.useEffect(() => setDraft(filters), [JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps

  const towns = useQuery(() => unwrap(crm.inventory.towns.$get()).then((r) => r.towns));
  const query = useQuery(
    () =>
      unwrap(
        crm.inventory.search.$post({
          json: {
            search: filters.q || null,
            town: filters.town || null,
            block: filters.block || null,
            type: (filters.type as InventoryType) || null,
            status: (filters.status as InventoryStatus) || null,
            project_slug: (filters.project as ProjectSlug) || null,
            on_website: filters.web === "yes" ? true : filters.web === "no" ? false : null,
            limit: PAGE_SIZE,
            offset: (page - 1) * PAGE_SIZE,
          },
        }),
      ),
    filters,
  );

  const apply = (event?: React.FormEvent) => {
    event?.preventDefault();
    setFilters({ ...draft, page: null }, true);
  };
  const townList = towns.status === "ready" ? towns.data : [];

  return (
    <>
      <PageHeader
        title="Properties"
        lede="Every property on the market and who owns it. Open a property's Website tab to put it on the site."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add property
          </Button>
        }
      />

      <Card className="mb-4">
        <form onSubmit={apply} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input className="sm:col-span-2" placeholder="House, contact, details" value={draft.q ?? ""} onChange={(e) => setDraft({ ...draft, q: e.target.value })} aria-label="Search" />
          <Select aria-label="Town" placeholder="All towns" value={draft.town ?? ""} options={townList.map((t) => ({ value: t, label: t }))} onChange={(e) => setDraft({ ...draft, town: e.target.value })} />
          <Input aria-label="Block" placeholder="Block" value={draft.block ?? ""} onChange={(e) => setDraft({ ...draft, block: e.target.value })} />
          <Select aria-label="Type" placeholder="All types" value={draft.type ?? ""} options={INVENTORY_TYPES.map((t) => ({ value: t, label: INVENTORY_TYPE_LABELS[t] }))} onChange={(e) => setDraft({ ...draft, type: e.target.value })} />
          <Select aria-label="Status" placeholder="Any status" value={draft.status ?? ""} options={[{ value: "available", label: "Available" }, { value: "sold", label: "Sold" }]} onChange={(e) => setDraft({ ...draft, status: e.target.value })} />
          <Select aria-label="Project" placeholder="All projects" value={draft.project ?? ""} options={WEBSITE_PROJECTS.map((p) => ({ value: p.slug, label: p.name }))} onChange={(e) => setDraft({ ...draft, project: e.target.value })} />
          <Select aria-label="On website" placeholder="Website: any" value={draft.web ?? ""} options={[{ value: "yes", label: "On website" }, { value: "no", label: "Not on website" }]} onChange={(e) => setDraft({ ...draft, web: e.target.value })} />
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit">Apply</Button>
            <Button variant="outline" onClick={() => setFilters({}, true)}>
              Clear
            </Button>
          </div>
        </form>
      </Card>

      <QueryView query={query}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState title="No properties match">Try clearing filters, or add a new property.</EmptyState>
          ) : (
            <div className={cn("flex flex-col gap-3", query.status === "ready" && query.refreshing && "opacity-60")}>
              <Table>
                <thead>
                  <tr>
                    <Th>House</Th>
                    <Th>Town</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th>Size</Th>
                    <Th>Asking price</Th>
                    <Th>Website</Th>
                    <Th>Contact</Th>
                    <Th>Direct / indirect</Th>
                    <Th>Phone</Th>
                    <Th>Entered by</Th>
                    <Th>Updated</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <Tr key={item.id} onClick={() => navigate(`/inventory/${item.id}`)} className={item.status === "sold" ? "opacity-45" : undefined}>
                      <Td>
                        <div className="font-semibold">{item.house_number}</div>
                        {item.block && <div className="text-xs text-muted-foreground">Block {item.block}</div>}
                      </Td>
                      <Td>{item.town}</Td>
                      <Td className="whitespace-nowrap">{INVENTORY_TYPE_LABELS[item.type]}</Td>
                      <Td>
                        <Badge tone={item.status === "available" ? "success" : "neutral"}>{item.status === "available" ? "Available" : "Sold"}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap">{item.size}</Td>
                      <Td className="whitespace-nowrap">{item.asking_price ?? "—"}</Td>
                      <Td>
                        {item.web.published ? (
                          <div className="flex items-center gap-2">
                            {item.web.cover && <img src={item.web.cover.thumb} alt="" className="h-8 w-10 shrink-0 rounded object-cover" loading="lazy" />}
                            <div className="flex flex-col items-start gap-1">
                              <Badge tone="gold">Published</Badge>
                              {item.web.featured && <Badge tone="purple">Featured</Badge>}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Td>
                      <Td>{item.contact_name}</Td>
                      <Td className="capitalize">{item.contact_kind}</Td>
                      <Td className="whitespace-nowrap">{item.contact_phone_number}</Td>
                      <Td>{item.entered_by_username ?? "—"}</Td>
                      <Td className="whitespace-nowrap">{formatWhen(item.updated_at ?? item.created_at)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <Pagination total={data.total} limit={PAGE_SIZE} offset={(page - 1) * PAGE_SIZE} noun="properties" onChange={(offset) => setFilters({ page: String(offset / PAGE_SIZE + 1) })} />
            </div>
          )
        }
      </QueryView>

      <AddItemDialog open={adding} onClose={() => setAdding(false)} towns={townList} onCreated={(id) => navigate(`/inventory/${id}`)} />
    </>
  );
}

function AddItemDialog({ open, onClose, towns, onCreated }: { open: boolean; onClose: () => void; towns: string[]; onCreated: (id: string) => void }) {
  const [form, setForm] = React.useState<InventoryFormState>(EMPTY_INVENTORY_FORM);
  const create = useAction((body: InventoryFormState) => unwrap(crm.inventory.$post({ json: payloadFromForm(body) })));
  React.useEffect(() => {
    if (open) setForm(EMPTY_INVENTORY_FORM);
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const item = await create.run(form);
    if (item) {
      toast.success("Property added");
      onClose();
      onCreated(item.id);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add property"
      width="max-w-5xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-inventory-form" pending={create.pending}>
            Add property
          </Button>
        </>
      }
    >
      <form id="add-inventory-form" onSubmit={submit}>
        <InventoryForm form={form} onChange={setForm} towns={towns} />
      </form>
    </Dialog>
  );
}

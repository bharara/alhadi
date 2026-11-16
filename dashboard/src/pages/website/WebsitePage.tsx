import React from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ExternalLink, EyeOff } from "lucide-react";
import { toast } from "sonner";
import type { InferResponseType } from "hono/client";
import { crm, unwrap, type InventoryItem } from "@/lib/api";
import { QueryView, useAction, useQuery } from "@/lib/hooks";
import { INVENTORY_TYPE_LABELS } from "@/lib/labels";
import { useSession } from "@/session";
import { Button } from "@/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/ui/form";
import { Badge, Card, EmptyState, PageHeader } from "@/ui/layout";

type WebsiteData = InferResponseType<typeof crm.website.$get, 200>;
type Settings = WebsiteData["settings"];
type ItemPatch = Partial<Pick<InventoryItem, "featured" | "show_price" | "published" | "website_order">>;

export function WebsitePage() {
  const website = useQuery(() => unwrap(crm.website.$get()));
  const items = useQuery(() => unwrap(crm.inventory.search.$post({ json: { published: true, limit: 200 } })));

  return (
    <>
      <PageHeader
        title="Website listings"
        lede="Choose what bestbuilderdeveloper.com shows. Changes appear on the site within about a minute."
        actions={
          website.status === "ready" && (
            <a href={website.data.site_url} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm hover:bg-muted">
              View site <ExternalLink className="h-4 w-4" />
            </a>
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <QueryView query={website}>{(data) => <SettingsCard data={data} onSaved={(settings) => website.setData((d) => ({ ...d, settings }))} />}</QueryView>
        <QueryView query={items}>
          {(data) =>
            website.status === "ready" ? (
              <PublishedList
                items={data.items}
                website={website.data}
                onChange={(next) => items.setData((d) => ({ ...d, items: next, total: next.length }))}
              />
            ) : null
          }
        </QueryView>
      </div>
    </>
  );
}

function SettingsCard({ data, onSaved }: { data: WebsiteData; onSaved: (settings: Settings) => void }) {
  const { user } = useSession();
  const isAdmin = user.role === "admin";
  const [form, setForm] = React.useState<Settings>(data.settings);
  const save = useAction((settings: Settings) => unwrap(crm.website.settings.$put({ json: settings })));
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm({ ...form, [key]: value });
  const dirty = JSON.stringify(form) !== JSON.stringify(data.settings);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = await save.run(form);
    if (result) {
      onSaved(result.settings);
      setForm(result.settings);
      toast.success("Website settings saved");
    }
  }

  return (
    <form onSubmit={submit}>
      <Card
        title="Sections"
        actions={isAdmin && <Button type="submit" size="sm" pending={save.pending} disabled={!dirty}>Save</Button>}
      >
        {!isAdmin && <p className="mb-4 text-xs text-muted-foreground">Only admins can change these settings.</p>}
        <fieldset disabled={!isAdmin} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="label-caps">Home page</div>
            <Checkbox label="Show the listings section on the home page" hint="Shows featured listings first, then the newest." checked={form.home_enabled} disabled={!isAdmin} onChange={(v) => set("home_enabled", v)} />
            <Field label="Heading">
              <Input value={form.home_heading} maxLength={120} onChange={(e) => set("home_heading", e.target.value)} required />
            </Field>
            <Field label="Intro">
              <Textarea rows={3} value={form.home_intro} maxLength={400} onChange={(e) => set("home_intro", e.target.value)} />
            </Field>
            <Field label="How many listings" hint="1 to 24">
              <Input type="number" min={1} max={24} value={form.home_limit} onChange={(e) => set("home_limit", Number(e.target.value))} className="max-w-[8rem]" required />
            </Field>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <div className="label-caps">Project pages</div>
            <Checkbox label="Show listings on each project page" checked={form.project_enabled} disabled={!isAdmin} onChange={(v) => set("project_enabled", v)} />
            <Field label="Heading">
              <Input value={form.project_heading} maxLength={120} onChange={(e) => set("project_heading", e.target.value)} required />
            </Field>
          </div>
          <div className="border-t border-border pt-5">
            <Checkbox label="Keep sold listings on the site, marked Sold" checked={form.show_sold} disabled={!isAdmin} onChange={(v) => set("show_sold", v)} />
          </div>
        </fieldset>
      </Card>
    </form>
  );
}

function PublishedList({ items, website, onChange }: { items: InventoryItem[]; website: WebsiteData; onChange: (items: InventoryItem[]) => void }) {
  const update = useAction((id: string, json: ItemPatch) => unwrap(crm.inventory[":id"].$patch({ param: { id }, json })));
  const [busy, setBusy] = React.useState<string | null>(null);

  const groups = [
    ...website.projects.map((p) => ({ key: p.slug as string | null, name: p.name, url: `${website.site_url}/${p.slug}/` })),
    { key: null, name: "Home page only (no project)", url: website.site_url },
  ]
    .map((g) => ({ ...g, items: items.filter((i) => i.project_slug === g.key) }))
    .filter((g) => g.key !== null || g.items.length > 0);

  async function patch(item: InventoryItem, json: ItemPatch) {
    setBusy(item.id);
    const next = await update.run(item.id, json);
    setBusy(null);
    if (!next) return;
    onChange(next.published ? items.map((i) => (i.id === next.id ? next : i)) : items.filter((i) => i.id !== next.id));
    if (!next.published) toast.success("Removed from the website");
  }

  /** Swaps an item with its neighbour, renumbering the group so orders stay distinct. */
  async function move(group: InventoryItem[], index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= group.length) return;
    const reordered = [...group];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    const changes = reordered.map((item, i) => ({ item, order: (i + 1) * 10 })).filter(({ item, order }) => item.website_order !== order);
    setBusy(group[index]!.id);
    const results = await Promise.all(changes.map(({ item, order }) => update.run(item.id, { website_order: order })));
    setBusy(null);
    const byId = new Map(results.filter((r): r is InventoryItem => Boolean(r)).map((r) => [r.id, r]));
    onChange(items.map((i) => byId.get(i.id) ?? i).sort((a, b) => a.website_order - b.website_order));
  }

  if (!items.length)
    return (
      <EmptyState title="Nothing is on the website yet">
        Open an item in <Link to="/inventory" className="font-medium underline">Inventory</Link> and turn on "Show on website".
      </EmptyState>
    );

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <Card
          key={group.key ?? "none"}
          title={`${group.name} · ${group.items.length}`}
          actions={
            <a href={group.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              View page <ExternalLink className="h-3.5 w-3.5" />
            </a>
          }
          bodyClassName="p-0"
        >
          {group.items.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">No listings on this page.</p>
          ) : (
            <ul className="divide-y divide-border">
              {group.items.map((item, index) => (
                <li key={item.id} className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center ${busy === item.id ? "opacity-60" : ""}`}>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="outline" size="icon" aria-label="Move up" disabled={!item.can_edit || index === 0 || busy !== null} onClick={() => move(group.items, index, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" aria-label="Move down" disabled={!item.can_edit || index === group.items.length - 1 || busy !== null} onClick={() => move(group.items, index, 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <Link to={`/inventory/${item.id}`} className="min-w-0 flex-1 hover:underline">
                    <div className="truncate font-medium">{item.public_title || `${item.size} ${INVENTORY_TYPE_LABELS[item.type].toLowerCase()}`}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {item.house_number}
                      {item.block ? `, Block ${item.block}` : ""} · {item.town}
                      {item.asking_price ? ` · ${item.asking_price}` : ""}
                    </div>
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {item.status === "sold" && <Badge>Sold</Badge>}
                    <Checkbox label="Home" checked={item.featured} disabled={!item.can_edit || busy !== null} onChange={(v) => patch(item, { featured: v })} />
                    <Checkbox label="Price" checked={item.show_price} disabled={!item.can_edit || busy !== null || !item.asking_price} onChange={(v) => patch(item, { show_price: v })} />
                    <Button variant="ghost" size="sm" disabled={!item.can_edit || busy !== null} onClick={() => patch(item, { published: false })}>
                      <EyeOff className="h-3.5 w-3.5" /> Unpublish
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

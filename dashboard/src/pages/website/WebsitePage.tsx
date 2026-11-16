import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ExternalLink, ImageIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { InferResponseType } from "hono/client";
import { crm, unwrap } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { QueryView, useAction, useQuery } from "@/lib/hooks";
import { WEBSITE_PROJECTS } from "@worker/inventory/fields";
import { useSession } from "@/session";
import { Button } from "@/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/ui/form";
import { Badge, Card, EmptyState, PageHeader } from "@/ui/layout";
import { Table, Td, Th, Tr } from "@/ui/table";
import { cn } from "@/ui/cn";

type WebsiteData = InferResponseType<typeof crm.website.$get, 200>;
type Settings = WebsiteData["settings"];
type Rebuild = WebsiteData["rebuild"];
type Property = InferResponseType<typeof crm.inventory.search.$post, 200>["items"][number];

const PAGE = 200;

// Every published property, in site order (the search caps a page at 200).
async function loadPublished(): Promise<Property[]> {
  const items: Property[] = [];
  for (;;) {
    const page = await unwrap(crm.inventory.search.$post({ json: { published: true, order: "website", limit: PAGE, offset: items.length } }));
    items.push(...page.items);
    if (items.length >= page.total || !page.items.length) return items;
  }
}

export function WebsitePage() {
  const website = useQuery(() => unwrap(crm.website.$get()));
  const published = useQuery(loadPublished);

  return (
    <>
      <PageHeader
        title="Website"
        lede="What bestbuilderdeveloper.com shows. Put a property on the site from its Website tab in Properties."
        actions={
          website.status === "ready" && (
            <a href={`${website.data.site_url.replace(/\/$/, "")}/properties/`} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm hover:bg-muted">
              View directory <ExternalLink className="h-4 w-4" />
            </a>
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_minmax(0,380px)]">
        <div className="min-w-0">
          <QueryView query={published}>
            {(properties) => (
              <OnWebsite
                properties={properties}
                onChange={(next) => {
                  published.setData(() => next);
                  website.retry();
                }}
              />
            )}
          </QueryView>
        </div>
        <div className="flex flex-col gap-6">
          <QueryView query={website}>
            {(data) => (
              <>
                <BuildCard rebuild={data.rebuild} onChange={(rebuild) => website.setData((d) => ({ ...d, rebuild }))} />
                <SettingsCard data={data} onSaved={(settings) => website.setData((d) => ({ ...d, settings }))} />
              </>
            )}
          </QueryView>
        </div>
      </div>
    </>
  );
}

const projectName = new Map<string, string>(WEBSITE_PROJECTS.map((p) => [p.slug, p.name]));

function OnWebsite({ properties, onChange }: { properties: Property[]; onChange: (properties: Property[]) => void }) {
  const navigate = useNavigate();
  const { user } = useSession();
  const [busy, setBusy] = React.useState<string | null>(null);
  const update = useAction((id: string, json: { featured?: boolean; published?: boolean }) => unwrap(crm.inventory[":id"].$patch({ param: { id }, json })));
  const reorder = useAction((ids: string[]) => unwrap(crm.inventory["web-order"].$put({ json: { ids } })));

  async function change(property: Property, json: { featured?: boolean; published?: boolean }) {
    setBusy(property.id);
    const next = await update.run(property.id, json);
    setBusy(null);
    if (!next) return;
    onChange(json.published === false ? properties.filter((p) => p.id !== property.id) : properties.map((p) => (p.id === property.id ? next : p)));
    if (json.published === false) toast.success("Taken off the website. It leaves after the automatic rebuild.");
  }

  async function move(index: number, to: number) {
    const ordered = [...properties];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(to, 0, moved!);
    if (await reorder.run(ordered.map((p) => p.id))) onChange(ordered.map((p, i) => ({ ...p, web_order: (i + 1) * 10 })));
  }

  if (!properties.length) {
    return (
      <EmptyState title="Nothing on the website yet">
        Open a property in <Link to="/inventory" className="underline">Properties</Link>, go to its Website tab and turn on "Show on website".
      </EmptyState>
    );
  }

  const canReorder = user.role === "admin" && !reorder.pending;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">This order is used across the site. Changes appear after the automatic rebuild, a few minutes after your last edit.</p>
      <Table>
        <thead>
          <tr>
            <Th className="w-20">Photo</Th>
            <Th>Property</Th>
            <Th>Project</Th>
            <Th>Home</Th>
            {user.role === "admin" && <Th>Order</Th>}
            <Th className="text-right">Website</Th>
          </tr>
        </thead>
        <tbody>
          {properties.map((property, index) => (
            <Tr key={property.id} onClick={() => navigate(`/inventory/${property.id}?tab=website`)}>
              <Td>
                {property.cover ? (
                  <img src={property.cover.thumb} alt="" className="h-12 w-16 rounded object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-12 w-16 items-center justify-center rounded bg-muted text-muted-foreground">
                    <ImageIcon className="h-4 w-4" />
                  </div>
                )}
              </Td>
              <Td className="min-w-[14rem]">
                <div className="font-medium">{property.web_title || property.auto_title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {property.photo_count} photo{property.photo_count === 1 ? "" : "s"}
                  {property.status === "sold" && <Badge tone="danger">Sold</Badge>}
                </div>
              </Td>
              <Td className="whitespace-nowrap text-muted-foreground">{property.project_slug ? projectName.get(property.project_slug) : "—"}</Td>
              <Td onClick={(e) => e.stopPropagation()}>
                <Toggle label="Feature on home page" checked={property.featured} disabled={!property.can_edit || busy === property.id} onChange={(v) => change(property, { featured: v })} />
              </Td>
              {user.role === "admin" && (
                <Td onClick={(e) => e.stopPropagation()}>
                  <div className="flex">
                    <Button size="icon" variant="ghost" aria-label="Move up" className="h-11 w-11" disabled={index === 0 || !canReorder} onClick={() => move(index, index - 1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Move down" className="h-11 w-11" disabled={index === properties.length - 1 || !canReorder} onClick={() => move(index, index + 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </Td>
              )}
              <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="outline" disabled={!property.can_edit || busy === property.id} onClick={() => change(property, { published: false })}>
                  Unpublish
                </Button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

// A 44px-tall hit area around a native checkbox.
function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={cn("flex h-11 w-11 cursor-pointer items-center justify-center", disabled && "cursor-not-allowed opacity-50")}>
      <input type="checkbox" aria-label={label} className="h-4 w-4 accent-[hsl(var(--primary))]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function BuildCard({ rebuild, onChange }: { rebuild: Rebuild; onChange: (rebuild: Rebuild) => void }) {
  const { user } = useSession();
  const trigger = useAction(() => unwrap(crm.website.rebuild.$post()));

  async function run() {
    const result = await trigger.run();
    if (!result) return;
    onChange(result.rebuild);
    toast.success("Site build started. Pages update in a couple of minutes.");
  }

  return (
    <Card
      title="Site build"
      actions={
        user.role === "admin" && (
          <Button size="sm" variant="outline" pending={trigger.pending} onClick={run}>
            <RefreshCw className="h-3.5 w-3.5" /> Rebuild site now
          </Button>
        )
      }
    >
      <p className="text-xs text-muted-foreground">Website changes appear on the site after the automatic rebuild, a few minutes after your last edit.</p>
      <div className="mt-3 flex flex-col gap-2 text-sm">
        {rebuild.requested_at ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">Changes waiting to publish. The site rebuilds automatically within a few minutes.</p>
        ) : (
          <p className="text-muted-foreground">No changes waiting.</p>
        )}
        <p>
          <span className="text-muted-foreground">Last build started:</span> {formatWhen(rebuild.triggered_at)}
        </p>
        {rebuild.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-rose-800">{rebuild.error}</p>}
      </div>
    </Card>
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
            <Checkbox label="Show the properties section on the home page" hint="Shows properties marked Featured on home." checked={form.home_enabled} disabled={!isAdmin} onChange={(v) => set("home_enabled", v)} />
            <Field label="Heading">
              <Input value={form.home_heading} maxLength={120} onChange={(e) => set("home_heading", e.target.value)} required />
            </Field>
            <Field label="Intro">
              <Textarea rows={3} value={form.home_intro} maxLength={400} onChange={(e) => set("home_intro", e.target.value)} />
            </Field>
            <Field label="How many properties" hint="1 to 24">
              <Input type="number" min={1} max={24} value={form.home_limit} onChange={(e) => set("home_limit", Number(e.target.value))} className="max-w-[8rem]" required />
            </Field>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <div className="label-caps">Project pages</div>
            <Checkbox label="Show properties on each project page" checked={form.project_enabled} disabled={!isAdmin} onChange={(v) => set("project_enabled", v)} />
            <Field label="Heading">
              <Input value={form.project_heading} maxLength={120} onChange={(e) => set("project_heading", e.target.value)} required />
            </Field>
          </div>
          <div className="border-t border-border pt-5">
            <Checkbox label="Keep sold properties on the site, marked Sold" checked={form.show_sold} disabled={!isAdmin} onChange={(v) => set("show_sold", v)} />
          </div>
        </fieldset>
      </Card>
    </form>
  );
}


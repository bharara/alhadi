import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, ImageIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { InferResponseType } from "hono/client";
import { crm, unwrap } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { QueryView, useAction, useQuery, useSearchState } from "@/lib/hooks";
import { WEBSITE_PROJECTS } from "@worker/website/fields";
import { useSession } from "@/session";
import { Button } from "@/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/ui/form";
import { Badge, Card, EmptyState, PageHeader } from "@/ui/layout";
import { Table, Td, Th, Tr } from "@/ui/table";
import { cn } from "@/ui/cn";

type WebsiteData = InferResponseType<typeof crm.website.$get, 200>;
type Settings = WebsiteData["settings"];
type Rebuild = WebsiteData["rebuild"];
type Listing = InferResponseType<typeof crm.listings.$get, 200>["listings"][number];

const TABS = [
  { value: "", label: "All" },
  { value: "published", label: "Published" },
  { value: "drafts", label: "Drafts" },
] as const;

const projectName = (slug: string | null) => WEBSITE_PROJECTS.find((p) => p.slug === slug)?.name ?? "No project page";

export function WebsitePage() {
  const website = useQuery(() => unwrap(crm.website.$get()));
  const listings = useQuery(() => unwrap(crm.listings.$get()));

  return (
    <>
      <PageHeader
        title="Website listings"
        lede="The curated directory on bestbuilderdeveloper.com. Create a listing from any property in Properties."
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
          <QueryView query={listings}>
            {(data) => (
              <ListingsTable
                listings={data.listings}
                onChange={(next) => {
                  listings.setData(() => ({ listings: next }));
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

function ListingsTable({ listings, onChange }: { listings: Listing[]; onChange: (listings: Listing[]) => void }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchState<"show">();
  const tab = params.show ?? "";
  const [busy, setBusy] = React.useState<string | null>(null);
  const update = useAction((id: string, json: { published?: boolean; featured?: boolean }) => unwrap(crm.listings[":id"].$patch({ param: { id }, json })));
  const shown = listings.filter((l) => (tab === "published" ? l.published : tab === "drafts" ? !l.published : true));

  async function toggle(listing: Listing, json: { published?: boolean; featured?: boolean }) {
    setBusy(listing.id);
    const next = await update.run(listing.id, json);
    setBusy(null);
    if (!next) return;
    const { photos: _photos, ...rest } = next;
    onChange(listings.map((l) => (l.id === listing.id ? { ...l, ...rest } : l)));
    if (json.published !== undefined) toast.success(json.published ? "Published. Its page goes live after the next site build." : "Unpublished");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1" role="tablist">
        {TABS.map((t) => {
          const count = listings.filter((l) => (t.value === "published" ? l.published : t.value === "drafts" ? !l.published : true)).length;
          return (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setParams({ show: t.value || null }, true)}
              className={cn("min-h-[40px] flex-1 rounded-md px-3 text-sm sm:flex-none", tab === t.value ? "bg-primary-muted font-medium" : "text-muted-foreground hover:bg-muted")}
            >
              {t.label} <span className="tabular-nums text-muted-foreground">{count}</span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <EmptyState title={listings.length ? "Nothing in this tab" : "No listings yet"}>
          {listings.length ? null : (
            <>
              Open a property in <Link to="/inventory" className="underline">Properties</Link> and choose "Create website listing".
            </>
          )}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th className="w-20">Photo</Th>
              <Th>Listing</Th>
              <Th>Status</Th>
              <Th>Published</Th>
              <Th>Home</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((listing) => (
              <Tr key={listing.id} onClick={() => navigate(`/website/listings/${listing.id}`)}>
                <Td>
                  {listing.cover ? (
                    <img src={listing.cover.thumb} alt="" className="h-12 w-16 rounded object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-12 w-16 items-center justify-center rounded bg-muted text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                  )}
                </Td>
                <Td className="min-w-[14rem]">
                  <div className="font-medium">{listing.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {projectName(listing.project_slug)} · {listing.photo_count} photo{listing.photo_count === 1 ? "" : "s"}
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {listing.published ? <Badge tone="gold">Published</Badge> : <Badge>Draft</Badge>}
                    {listing.item.status === "sold" && <Badge tone="danger">Sold</Badge>}
                  </div>
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <Toggle label={`Publish ${listing.title}`} checked={listing.published} disabled={!listing.can_edit || busy === listing.id} onChange={(v) => toggle(listing, { published: v })} />
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <Toggle label={`Feature ${listing.title} on home`} checked={listing.featured} disabled={!listing.can_edit || busy === listing.id} onChange={(v) => toggle(listing, { featured: v })} />
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">{formatWhen(listing.updated_at ?? listing.created_at)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

/** A 44px-tall hit area around a native checkbox. */
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
    if (result.rebuild.error) toast.error(result.rebuild.error);
    else toast.success("Site build started. Pages update in a couple of minutes.");
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
      <p className="text-xs text-muted-foreground">Changes to published listings appear on the site after the automatic rebuild, a few minutes after your last edit.</p>
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
            <Checkbox label="Show the listings section on the home page" hint="Shows listings marked Featured on home." checked={form.home_enabled} disabled={!isAdmin} onChange={(v) => set("home_enabled", v)} />
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


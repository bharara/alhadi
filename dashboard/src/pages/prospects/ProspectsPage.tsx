import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { crm, fetchUsers, unwrap } from "@/lib/api";
import { dataOr, QueryView, useAction, useQuery, useSearchState } from "@/lib/hooks";
import { Button } from "@/ui/button";
import { Badge, ConfirmDialog, EmptyState, PageHeader, Pagination } from "@/ui/layout";
import { ImportDialog } from "./ImportDialog";
import { AddProspectDialog, BulkEditDialog } from "./ProspectDialogs";
import { ProspectFilters, searchBodyFrom, type ListParams } from "./ProspectFilters";
import { allMatchingIds, BULK_LIMIT, chunk, loadExtraFields, loadTags, ProspectTable } from "./shared";

const PAGE_SIZES = [20, 50, 100];

export function ProspectsPage() {
  const [params, setParams] = useSearchState<keyof ListParams>();
  const navigate = useNavigate();
  const location = useLocation();
  const users = dataOr(useQuery(fetchUsers), []);
  const extraFields = dataOr(useQuery(loadExtraFields), []);
  const [tagsVersion, setTagsVersion] = React.useState(0);
  const tags = useQuery(loadTags, tagsVersion);
  const tagSuggestions = dataOr(tags, []);

  const pageSize = PAGE_SIZES.includes(Number(params.pageSize)) ? Number(params.pageSize) : 20;
  const page = Math.max(1, Number(params.page) || 1);
  const body = searchBodyFrom(params);
  const [version, setVersion] = React.useState(0);
  const query = useQuery(() => unwrap(crm.prospects.search.$post({ json: { ...body, limit: pageSize, offset: (page - 1) * pageSize } })), [params, version]);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  // A selection belongs to one set of filters; paging keeps it.
  const filterKey = JSON.stringify(body);
  React.useEffect(() => {
    setSelected(new Set());
  }, [filterKey]);
  // The dashboard's "+" menu links here with ?add=1 or ?import=1.
  const [dialog, setDialog] = React.useState<null | "add" | "import" | "bulk" | "delete">(() => {
    const search = new URLSearchParams(location.search);
    return search.has("add") ? "add" : search.has("import") ? "import" : null;
  });
  React.useEffect(() => {
    const search = new URLSearchParams(location.search);
    if (!search.has("add") && !search.has("import")) return;
    search.delete("add");
    search.delete("import");
    navigate({ search: search.toString() }, { replace: true });
  }, [location.search, navigate]);
  const refresh = () => {
    setVersion((v) => v + 1);
    setTagsVersion((v) => v + 1);
  };

  const selectAll = useAction(() => allMatchingIds(body));
  const remove = useAction(async () => {
    let deleted = 0;
    for (const prospect_ids of chunk([...selected], BULK_LIMIT)) deleted += (await unwrap(crm.prospects["bulk-delete"].$post({ json: { prospect_ids } }))).deleted;
    return { deleted };
  });

  async function selectAllMatching() {
    const ids = await selectAll.run();
    if (ids) setSelected(new Set(ids));
  }

  async function removeSelected() {
    const result = await remove.run();
    if (!result) return;
    toast.success(`Removed ${result.deleted} lead${result.deleted === 1 ? "" : "s"}`);
    setSelected(new Set());
    setDialog(null);
    refresh();
  }

  return (
    <>
      <PageHeader
        crumbs="CRM / Prospects"
        title="Prospects"
        lede="Click a row to view the full profile and history."
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog("import")}>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button onClick={() => setDialog("add")}>
              <Plus className="h-4 w-4" /> Add prospect
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ProspectFilters params={params} onApply={(next) => setParams(next)} users={users} extraFields={extraFields} />
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {query.status === "ready" && <Badge>{query.data.total.toLocaleString()} total</Badge>}
              <Badge tone={selected.size ? "gold" : "neutral"}>{selected.size.toLocaleString()} selected</Badge>
              {query.status === "ready" && query.data.total > 0 && selected.size < query.data.total && (
                <Button variant="ghost" size="sm" pending={selectAll.pending} onClick={selectAllMatching}>
                  Select all {query.data.total.toLocaleString()} matching
                </Button>
              )}
              {selected.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!selected.size} onClick={() => setDialog("bulk")}>
                <Pencil className="h-3.5 w-3.5" /> Bulk edit
              </Button>
              <Button variant="danger-outline" size="sm" disabled={!selected.size} onClick={() => setDialog("delete")}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          </div>

          <QueryView query={query}>
            {(data) =>
              data.prospects.length === 0 ? (
                <EmptyState title="No prospects match">Change the filters, or add a prospect.</EmptyState>
              ) : (
                <div className={query.status === "ready" && query.refreshing ? "opacity-60 transition-opacity" : undefined}>
                  <ProspectTable
                    prospects={data.prospects}
                    selected={selected}
                    onOpen={(p) => navigate(`/prospects/${p.id}`, { state: { from: location.pathname + location.search } })}
                    onToggle={(id) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                    onTogglePage={(checked) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        for (const p of data.prospects) {
                          if (checked) next.add(p.id);
                          else next.delete(p.id);
                        }
                        return next;
                      })
                    }
                  />
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      Rows per page
                      <select
                        className="h-9 rounded-md border border-border bg-card px-2"
                        value={pageSize}
                        onChange={(e) => setParams({ pageSize: e.target.value, page: null })}
                      >
                        {PAGE_SIZES.map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <div className="flex-1 sm:max-w-sm">
                      <Pagination total={data.total} limit={pageSize} offset={(page - 1) * pageSize} onChange={(offset) => setParams({ page: String(offset / pageSize + 1) })} noun="prospects" />
                    </div>
                  </div>
                </div>
              )
            }
          </QueryView>
        </div>
      </div>

      <AddProspectDialog open={dialog === "add"} onClose={() => setDialog(null)} onSaved={refresh} users={users} tagSuggestions={tagSuggestions} />
      <ImportDialog open={dialog === "import"} onClose={() => setDialog(null)} onImported={refresh} tagSuggestions={tagSuggestions} />
      <BulkEditDialog
        open={dialog === "bulk"}
        onClose={() => setDialog(null)}
        onSaved={refresh}
        ids={[...selected]}
        users={users}
        tagSuggestions={tagSuggestions}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        title={`Remove ${selected.size} lead${selected.size === 1 ? "" : "s"}?`}
        body="All touches for these leads will be removed. This cannot be undone."
        confirmLabel="Remove"
        danger
        pending={remove.pending}
        onConfirm={() => void removeSelected()}
        onClose={() => setDialog(null)}
      />
    </>
  );
}

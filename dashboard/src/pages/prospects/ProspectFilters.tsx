import React from "react";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import type { CrmUser } from "@/lib/api";
import { fromLocalInput, titleFromKey, toLocalInput } from "@/lib/format";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Checkbox, Field, Input, Select } from "@/ui/form";
import { Card } from "@/ui/layout";
import { STATUS_OPTIONS, TOUCH_KIND_OPTIONS } from "@/lib/labels";
import { userOptions, type ProspectSearchBody } from "./shared";

type FieldFilter = { field: string; operator: "contains" | "not_contains" | "empty" | "not_empty"; value?: string };

/** The URL params a prospect list reads; dashboard drill-downs link here with the same names. */
export type ListParams = Partial<
  Record<"q" | "status" | "assigned" | "unassigned" | "untouched" | "touchedBefore" | "touchedAfter" | "touchKind" | "filters" | "page" | "pageSize", string>
>;

const OPERATORS = [
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Not contains" },
  { value: "empty", label: "Empty" },
  { value: "not_empty", label: "Not empty" },
];

const BASE_FIELDS = ["email", "name", "company", "title", "phone", "tags", "assigned_user", "status"];

function parseFieldFilters(raw: string | undefined): FieldFilter[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as FieldFilter[];
    return Array.isArray(parsed) ? parsed.filter((f) => f && typeof f.field === "string" && typeof f.operator === "string") : [];
  } catch {
    return [];
  }
}

export function searchBodyFrom(params: ListParams, extra: Partial<ProspectSearchBody> = {}): ProspectSearchBody {
  const fieldFilters = parseFieldFilters(params.filters).map((f) => ({ field: f.field, operator: f.operator, value: f.value ?? null }));
  if (params.unassigned === "1") fieldFilters.push({ field: "assigned_user", operator: "empty", value: null });
  return {
    search: params.q || null,
    status: (params.status || null) as ProspectSearchBody["status"],
    assigned_user_id: params.unassigned === "1" ? null : params.assigned || null,
    field_filters: fieldFilters,
    touched: params.untouched === "1" ? false : null,
    last_touched_after: params.touchedAfter || null,
    last_touched_before: params.touchedBefore || null,
    touch_kind: (params.touchKind || null) as ProspectSearchBody["touch_kind"],
    ...extra,
  };
}

type Draft = Required<Pick<ListParams, "q" | "status" | "assigned" | "touchedAfter" | "touchedBefore" | "touchKind">> & {
  unassigned: boolean;
  untouched: boolean;
  filters: FieldFilter[];
};

const draftFrom = (params: ListParams): Draft => ({
  q: params.q ?? "",
  status: params.status ?? "",
  assigned: params.assigned ?? "",
  touchedAfter: params.touchedAfter ?? "",
  touchedBefore: params.touchedBefore ?? "",
  touchKind: params.touchKind ?? "",
  unassigned: params.unassigned === "1",
  untouched: params.untouched === "1",
  filters: parseFieldFilters(params.filters),
});

export function ProspectFilters({
  params,
  onApply,
  users,
  extraFields = [],
  mode = "prospects",
}: {
  params: ListParams;
  onApply: (next: Partial<Record<keyof ListParams, string | null>>) => void;
  users: CrmUser[];
  extraFields?: string[];
  mode?: "prospects" | "touches";
}) {
  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(params));
  const [openOnMobile, setOpenOnMobile] = React.useState(false);
  const paramsKey = JSON.stringify(params);
  React.useEffect(() => setDraft(draftFrom(params)), [paramsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const fieldOptions = [...BASE_FIELDS, ...extraFields.map((k) => `extra.${k}`)].map((value) => ({
    value,
    label: value === "assigned_user" ? "Assigned user" : value.startsWith("extra.") ? titleFromKey(value.slice(6)) : titleFromKey(value),
  }));

  function apply(event?: React.FormEvent) {
    event?.preventDefault();
    const filters = draft.filters.filter((f) => f.field && (f.operator === "empty" || f.operator === "not_empty" || f.value?.trim()));
    onApply({
      q: draft.q.trim() || null,
      status: mode === "prospects" ? draft.status || null : null,
      assigned: draft.unassigned ? null : draft.assigned || null,
      unassigned: mode === "prospects" && draft.unassigned ? "1" : null,
      untouched: mode === "prospects" && draft.untouched ? "1" : null,
      touchedAfter: draft.touchedAfter || null,
      touchedBefore: draft.touchedBefore || null,
      touchKind: mode === "touches" ? draft.touchKind || null : null,
      filters: mode === "prospects" && filters.length ? JSON.stringify(filters) : null,
      page: null,
    });
    setOpenOnMobile(false);
  }

  function clear() {
    onApply({ q: null, status: null, assigned: null, unassigned: null, untouched: null, touchedAfter: null, touchedBefore: null, touchKind: null, filters: null, page: null });
    setOpenOnMobile(false);
  }

  const updateFilter = (index: number, patch: Partial<FieldFilter>) => set("filters", draft.filters.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  return (
    <div className="lg:sticky lg:top-6">
      <Button variant="outline" className="mb-3 w-full lg:hidden" onClick={() => setOpenOnMobile((o) => !o)}>
        <SlidersHorizontal className="h-4 w-4" /> {openOnMobile ? "Hide filters" : "Show filters"}
      </Button>
      <Card title="Filters" className={cn(!openOnMobile && "hidden lg:block")}>
        <form onSubmit={apply} className="flex flex-col gap-4">
          <Field label="Search">
            <Input value={draft.q} onChange={(e) => set("q", e.target.value)} placeholder="Email, name, company, tag, assigned user" />
          </Field>
          {mode === "prospects" ? (
            <Field label="Status">
              <Select options={STATUS_OPTIONS} placeholder="Any status" value={draft.status} onChange={(e) => set("status", e.target.value)} />
            </Field>
          ) : (
            <Field label="Last touch kind">
              <Select options={TOUCH_KIND_OPTIONS} placeholder="Any kind" value={draft.touchKind} onChange={(e) => set("touchKind", e.target.value)} />
            </Field>
          )}
          <Field label="Assigned user">
            <Select options={userOptions(users)} placeholder="Anyone" value={draft.assigned} disabled={draft.unassigned} onChange={(e) => set("assigned", e.target.value)} />
          </Field>
          {mode === "prospects" && <Checkbox label="Unassigned" checked={draft.unassigned} onChange={(v) => set("unassigned", v)} />}

          {mode === "prospects" && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium">Field filters</span>
              {draft.filters.map((filter, index) => (
                <div key={index} className="flex flex-col gap-2 rounded-md border border-border p-2.5">
                  <div className="flex gap-2">
                    <Select options={fieldOptions} value={filter.field} onChange={(e) => updateFilter(index, { field: e.target.value, value: "" })} aria-label="Field" />
                    <Button variant="ghost" size="icon" aria-label="Remove filter" onClick={() => set("filters", draft.filters.filter((_, i) => i !== index))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Select options={OPERATORS} value={filter.operator} onChange={(e) => updateFilter(index, { operator: e.target.value as FieldFilter["operator"] })} aria-label="Operator" />
                  {(filter.operator === "contains" || filter.operator === "not_contains") &&
                    (filter.field === "assigned_user" ? (
                      <Select options={userOptions(users)} placeholder="Choose a user" value={filter.value ?? ""} onChange={(e) => updateFilter(index, { value: e.target.value })} aria-label="User" />
                    ) : filter.field === "status" ? (
                      <Select options={STATUS_OPTIONS} placeholder="Choose a status" value={filter.value ?? ""} onChange={(e) => updateFilter(index, { value: e.target.value })} aria-label="Status" />
                    ) : (
                      <Input value={filter.value ?? ""} onChange={(e) => updateFilter(index, { value: e.target.value })} placeholder="Value" aria-label="Value" />
                    ))}
                </div>
              ))}
              <Button variant="outline" size="sm" className="self-start" onClick={() => set("filters", [...draft.filters, { field: "company", operator: "contains", value: "" }])}>
                <Plus className="h-3.5 w-3.5" /> Add field filter
              </Button>
            </div>
          )}

          {mode === "prospects" && <Checkbox label="Untouched" hint="Never contacted" checked={draft.untouched} onChange={(v) => set("untouched", v)} />}
          <Field label="Last touched after">
            <Input type="datetime-local" value={toLocalInput(draft.touchedAfter)} onChange={(e) => set("touchedAfter", fromLocalInput(e.target.value) ?? "")} />
          </Field>
          <Field label="Last touched before">
            <Input type="datetime-local" value={toLocalInput(draft.touchedBefore)} onChange={(e) => set("touchedBefore", fromLocalInput(e.target.value) ?? "")} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              Apply filters
            </Button>
            <Button variant="outline" onClick={clear}>
              Clear
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

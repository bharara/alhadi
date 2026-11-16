import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Plus, Upload } from "lucide-react";
import { crm, unwrap } from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/format";
import { QueryView, Spinner, useQuery, useSearchState } from "@/lib/hooks";
import { cn } from "@/ui/cn";
import { Input, Select } from "@/ui/form";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/ui/layout";
import { Table, Td, Th, Tr } from "@/ui/table";
import { buildManagerInsights, type Insight } from "./insights";
import { formatRange, PERIODS, rangeInstants, resolveRange, type Range } from "./period";
import type { ActivityRow, CampaignRow, CohortRow, Drill, Report } from "./types";

const TrendChart = React.lazy(() => import("./TrendChart"));

const ACTIVITY_COLORS = { calls: "#1677ff", whatsapp: "#52c41a", visits: "#faad14" } as const;

type SortKey = "total" | "visits" | "reach" | "conversion";
const SORTS: { value: SortKey; label: string }[] = [
  { value: "total", label: "By total" },
  { value: "visits", label: "By visits" },
  { value: "reach", label: "By reach" },
  { value: "conversion", label: "By conversion" },
];

export function DashboardPage() {
  const [params, setParams] = useSearchState<"period" | "from" | "to">();
  const range = resolveRange(params.period, params.from, params.to);
  const stats = useQuery(() => unwrap(crm.prospects.stats.$get()));
  const report = useQuery(() => unwrap(crm.dashboard.report.$get({ query: { start_date: range.start, end_date: range.end } })), range);
  const navigate = useNavigate();

  const drill = (target: Drill) => {
    const { after, before } = rangeInstants(range);
    const query = new URLSearchParams(target.userId ? { assigned: target.userId } : { unassigned: "1" });
    query.set("touchedAfter", after);
    query.set("touchedBefore", before);
    navigate(`/prospects?${query}`);
  };

  return (
    <>
      <PageHeader title="CRM" lede="Prospects, follow-ups and how the sales team is doing." />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="relative">
          <Stat
            label="Total prospected"
            value={stats.status === "ready" ? formatNumber(stats.data.total_prospected) : "…"}
            hint="All prospects in the CRM"
            onClick={() => navigate("/prospects")}
          />
          <AddMenu />
        </div>
        <Stat
          label="Contacted"
          value={stats.status === "ready" ? formatNumber(stats.data.contacted) : "…"}
          hint={stats.status === "ready" ? `${formatNumber(stats.data.contacted_this_month)} last contacted this month` : undefined}
          onClick={() => navigate("/touches")}
        />
      </div>

      <Card
        title="Reporting"
        bodyClassName="flex flex-col gap-6"
        actions={<span className="text-xs text-muted-foreground">{formatRange(range)} · PKT</span>}
      >
        <PeriodPicker range={range} onChange={(next) => setParams(next)} />
        <QueryView query={report}>
          {(data) => (
            <div className={cn("flex flex-col gap-6", report.status === "ready" && report.refreshing && "opacity-60 transition-opacity")}>
              <Kpis report={data} />
              <Insights insights={buildManagerInsights(data)} onDrill={drill} />
              <Activity report={data} onDrill={drill} />
              <CohortFunnel rows={data.campaign_cohort} onDrill={drill} />
              <section>
                <h3 className="mb-3 text-sm font-semibold">Trend</h3>
                {data.trend.some((row) => row.calls || row.whatsapp || row.visits) ? (
                  <React.Suspense fallback={<Spinner className="py-24" />}>
                    <TrendChart rows={data.trend} weekly={daysIn(range) > 30} />
                  </React.Suspense>
                ) : (
                  <EmptyState title="No calls, WhatsApp messages or visits in this period" />
                )}
              </section>
            </div>
          )}
        </QueryView>
      </Card>
    </>
  );
}

const daysIn = (range: Range) => Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86_400_000) + 1;

function AddMenu() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="absolute right-3 top-3">
      <button
        type="button"
        aria-label="Add prospects"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground hover:border-primary hover:bg-primary-muted"
      >
        <Plus className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-border bg-card py-1 shadow-lg">
          <Link to="/prospects?add=1" className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted">
            <Plus className="h-4 w-4" /> Add prospect
          </Link>
          <Link to="/prospects?import=1" className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" /> Upload CSV
          </Link>
        </div>
      )}
    </div>
  );
}

function PeriodPicker({ range, onChange }: { range: Range; onChange: (next: { period: string; from: string | null; to: string | null }) => void }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="flex flex-wrap gap-1 rounded-md bg-muted p-1" role="radiogroup" aria-label="Period">
        {PERIODS.map((period) => (
          <button
            key={period.value}
            type="button"
            role="radio"
            aria-checked={range.period === period.value}
            onClick={() =>
              onChange(
                period.value === "custom"
                  ? { period: "custom", from: range.start, to: range.end }
                  : { period: period.value, from: null, to: null },
              )
            }
            className={cn(
              "min-h-9 rounded px-3 text-xs font-medium transition-colors",
              range.period === period.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {period.label}
          </button>
        ))}
      </div>
      {range.period === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" aria-label="From" className="w-40" value={range.start} max={range.end} onChange={(e) => e.target.value && onChange({ period: "custom", from: e.target.value, to: range.end })} />
          <span className="text-muted-foreground">to</span>
          <Input type="date" aria-label="To" className="w-40" value={range.end} min={range.start} onChange={(e) => e.target.value && onChange({ period: "custom", from: range.start, to: e.target.value })} />
          <span className="text-xs text-muted-foreground">Up to 365 days</span>
        </div>
      )}
    </div>
  );
}

function Kpis({ report }: { report: Report }) {
  const k = report.kpis;
  const tiles = [
    { label: "Prospects in scope", value: formatNumber(k.prospects_in_scope), hint: "Created in this period" },
    { label: "Assigned prospects", value: formatNumber(k.assigned_prospects), hint: "Of those, with a salesperson" },
    { label: "Unique prospects contacted", value: formatNumber(k.unique_contacted), hint: "By call, WhatsApp or visit" },
    { label: "Total activities", value: formatNumber(k.total_activities), hint: "Calls, WhatsApp and visits" },
    { label: "Reach rate", value: formatPercent(k.reach_rate), hint: "Contacted ÷ assigned" },
    { label: "Visit conversion", value: formatPercent(k.visit_conversion), hint: "Visited ÷ assigned" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border border-border p-3" title={tile.hint}>
          <div className="label-caps">{tile.label}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{tile.value}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{tile.hint}</div>
        </div>
      ))}
    </div>
  );
}

function Insights({ insights, onDrill }: { insights: Insight[]; onDrill: (target: Drill) => void }) {
  if (!insights.length) return null;
  const tone = { info: "border-sky-200 bg-sky-50/60", success: "border-emerald-200 bg-emerald-50/60", warning: "border-amber-200 bg-amber-50/60" } as const;
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">What stands out</h3>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {insights.map((insight, index) => (
          <li key={index} className={cn("flex flex-col gap-1 rounded-lg border p-3", tone[insight.tone])}>
            <span className="text-xs font-semibold">{insight.title}</span>
            <span className="text-sm">{insight.text}</span>
            {insight.drill && (
              <button type="button" onClick={() => onDrill(insight.drill!)} className="mt-1 self-start text-xs font-medium underline underline-offset-2">
                See these prospects
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Activity({ report, onDrill }: { report: Report; onDrill: (target: Drill) => void }) {
  const [sort, setSort] = React.useState<SortKey>("total");
  const cohort = new Map<string | null, CohortRow>(report.cohort.map((row) => [row.user_id, row]));
  const value = (row: ActivityRow) =>
    sort === "total" ? row.total : sort === "visits" ? row.visits : sort === "reach" ? (cohort.get(row.user_id)?.contact_rate ?? -1) : (cohort.get(row.user_id)?.visit_rate ?? -1);
  const rows = [...report.activity].sort((a, b) => value(b) - value(a));
  const max = Math.max(1, ...rows.map((row) => row.total));

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Activity by salesperson</h3>
        <div className="flex items-center gap-3">
          <Legend />
          <Select aria-label="Sort salespeople" className="h-9 w-40" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} options={SORTS} />
        </div>
      </div>
      {rows.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {rows.map((row) => {
            const c = cohort.get(row.user_id);
            return (
              <li key={row.user_id ?? "unassigned"}>
                <button type="button" onClick={() => onDrill({ userId: row.user_id })} className="grid w-full grid-cols-1 gap-2 px-3 py-3 text-left hover:bg-primary-muted/40 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-4">
                  <span className="truncate text-sm font-medium">{row.username}</span>
                  <span className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                    {(["calls", "whatsapp", "visits"] as const).map((key) => (
                      <span key={key} style={{ width: `${(row[key] / max) * 100}%`, background: ACTIVITY_COLORS[key] }} />
                    ))}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                    <span>{row.calls} calls</span>
                    <span>{row.whatsapp} WhatsApp</span>
                    <span>{row.visits} visits</span>
                    <span className="font-semibold text-foreground">{row.total} total</span>
                    {c && (
                      <span>
                        reach {formatPercent(c.contact_rate)} · conv. {formatPercent(c.visit_rate)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No salespeople yet">Activity shows for active members who aren't admins.</EmptyState>
      )}
    </section>
  );
}

function Legend() {
  return (
    <span className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
      {(
        [
          ["Calls", ACTIVITY_COLORS.calls],
          ["WhatsApp", ACTIVITY_COLORS.whatsapp],
          ["Visits", ACTIVITY_COLORS.visits],
        ] as const
      ).map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
      ))}
    </span>
  );
}

function CohortFunnel({ rows, onDrill }: { rows: CampaignRow[]; onDrill: (target: Drill) => void }) {
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const toggle = (campaign: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(campaign)) next.delete(campaign);
      else next.add(campaign);
      return next;
    });

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">Cohort funnel</h3>
      <p className="mb-3 text-xs text-muted-foreground">Prospects created in this period, by lead tag. Status counts include contacted prospects only.</p>
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <Th>Campaign (lead tag)</Th>
              <Th className="text-right">Cohort</Th>
              <Th className="text-right">Contacted</Th>
              <Th className="text-right">Cold</Th>
              <Th className="text-right">Warm</Th>
              <Th className="text-right">Hot</Th>
              <Th className="text-right">DNC</Th>
              <Th>Recorded visitors</Th>
              <Th className="text-right">Drop-off</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = open.has(row.campaign);
              return (
                <React.Fragment key={row.campaign}>
                  <Tr onClick={row.salespeople.length ? () => toggle(row.campaign) : undefined}>
                    <Td className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {row.salespeople.length > 0 && (expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />)}
                        {row.campaign}
                      </span>
                    </Td>
                    <FunnelCells row={row} />
                  </Tr>
                  {expanded &&
                    row.salespeople.map((person) => (
                      <Tr key={`${row.campaign}-${person.user_id ?? "unassigned"}`} onClick={() => onDrill({ userId: person.user_id })} className="bg-muted/30">
                        <Td className="pl-9 text-muted-foreground">{person.username}</Td>
                        <FunnelCells row={person} />
                      </Tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No prospects were created in this period" />
      )}
    </section>
  );
}

function FunnelCells({ row }: { row: Omit<CampaignRow, "campaign" | "salespeople"> }) {
  const contacted = row.cold + row.warm + row.hot + row.dnc;
  const rate = row.visit_rate ?? 0;
  return (
    <>
      <Td className="text-right tabular-nums">{row.cohort_size}</Td>
      <Td className="text-right tabular-nums">{contacted}</Td>
      <Td className="text-right tabular-nums">{row.cold}</Td>
      <Td className="text-right tabular-nums">{row.warm}</Td>
      <Td className="text-right tabular-nums">{row.hot ? <Badge tone="success">{row.hot}</Badge> : 0}</Td>
      <Td className="text-right tabular-nums">{row.dnc}</Td>
      <Td className="min-w-[11rem]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-20 overflow-hidden rounded-full bg-muted">
            <span className="block h-full bg-primary" style={{ width: `${Math.min(100, rate * 100)}%` }} />
          </span>
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {row.visited} / {row.cohort_size} ({formatPercent(row.visit_rate)})
          </span>
        </div>
      </Td>
      <Td className="text-right tabular-nums">{row.cohort_size - row.visited}</Td>
    </>
  );
}

import React from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { InferResponseType } from "hono/client";
import { crm, errorMessage, unwrap } from "@/lib/api";
import { formatNumber, formatWhen } from "@/lib/format";
import { QueryView, Spinner, useAction, useQuery } from "@/lib/hooks";
import { useSession } from "@/session";
import { Button } from "@/ui/button";
import { Select } from "@/ui/form";
import { Badge, Card, EmptyState, PageHeader, type Tone } from "@/ui/layout";
import { Table, Td, Th, Tr } from "@/ui/table";

import { DeltaTile, PeriodSelect, percentChange, pointsChange, usePeriod } from "../analytics-shared";

const DailyChart = React.lazy(() => import("./DailyChart"));

type Search = InferResponseType<typeof crm.analytics.search.$get, 200>;
type Row = Search["top_queries"][number];
type Days = "7" | "28" | "90" | "180" | "365";
const PERIODS: readonly { value: Days; label: string }[] = [
  { value: "7", label: "Last 7 days" },
  { value: "28", label: "Last 28 days" },
  { value: "90", label: "Last 3 months" },
  { value: "180", label: "Last 6 months" },
  { value: "365", label: "Last 12 months" },
];
const DAY_MS = 86_400_000;
const BACKFILL_DAYS = 486;
const WINDOW_DAYS = 90;

export function AnalyticsPage() {
  const [days, setDays] = usePeriod(PERIODS);
  const query = useQuery(
    () => unwrap(crm.analytics.search.$get({ query: { days } })),
    days,
  );

  return (
    <>
      <PageHeader
        title="Search analytics"
        lede="How bestbuilderdeveloper.com performs in Google Search, from Search Console."
        actions={<PeriodSelect periods={PERIODS} value={days} onChange={setDays} />}
      />
      <QueryView query={query}>{(data) => <AnalyticsBody data={data} onSynced={query.retry} />}</QueryView>
    </>
  );
}

function AnalyticsBody({ data, onSynced }: { data: Search; onSynced: () => void }) {
  if (!data.configured && !data.totals) return <SetupGuide property={data.property} />;
  const consoleUrl = `https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(data.property)}`;

  return (
    <div className="flex flex-col gap-4">
      <SyncBar data={data} consoleUrl={consoleUrl} onSynced={onSynced} />
      {!data.totals || !data.previous ? (
        <EmptyState title="No Search Console data yet">Run a sync, or backfill the last 16 months. New sites can take a few days to show data.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <DeltaTile label="Clicks" value={formatNumber(data.totals.clicks)} delta={percentChange(data.totals.clicks, data.previous.clicks)} />
            <DeltaTile label="Impressions" value={formatNumber(data.totals.impressions)} delta={percentChange(data.totals.impressions, data.previous.impressions)} />
            <DeltaTile
              label="CTR"
              value={data.totals.ctr == null ? "—" : `${(data.totals.ctr * 100).toFixed(1)}%`}
              delta={pointsChange(data.totals.ctr, data.previous.ctr)}
            />
            <DeltaTile
              label="Average position"
              value={data.totals.position == null ? "—" : data.totals.position.toFixed(1)}
              delta={
                data.totals.position != null && data.previous.position != null
                  ? { text: `${data.totals.position <= data.previous.position ? "▲" : "▼"} ${Math.abs(data.totals.position - data.previous.position).toFixed(1)}`, good: data.totals.position <= data.previous.position }
                  : null
              }
            />
          </div>

          <Card title="Clicks and impressions per day">
            <React.Suspense fallback={<Spinner className="h-64 items-center" />}>
              <DailyChart data={data.daily} />
            </React.Suspense>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <RankTable title="Top queries" rows={data.top_queries} column="Query" />
            <RankTable title="Top pages" rows={data.top_pages} column="Page" formatKey={pagePath} />
          </div>

          <RankTable
            title="Striking distance"
            lede="Queries ranking 8 to 20. A better page or a few links can move these onto page one."
            rows={data.striking}
            column="Query"
            initialSort="impressions"
          />
        </>
      )}
    </div>
  );
}

function SyncBar({ data, consoleUrl, onSynced }: { data: Search; consoleUrl: string; onSynced: () => void }) {
  const { user } = useSession();
  const isAdmin = user.role === "admin";
  const sync = useAction((range: { start?: string; end?: string }) => unwrap(crm.analytics.sync.$post({ json: range })));
  const [backfill, setBackfill] = React.useState<{ done: number; total: number } | null>(null);

  async function syncNow() {
    const result = await sync.run({});
    if (result) {
      toast.success(`Synced ${result.days} days (${formatNumber(result.rows)} rows)`);
      onSynced();
    }
  }

  async function runBackfill() {
    const end = Date.now() - DAY_MS;
    const windows: { start: string; end: string }[] = [];
    for (let start = end - (BACKFILL_DAYS - 1) * DAY_MS; start <= end; start += WINDOW_DAYS * DAY_MS) {
      windows.push({ start: day(start), end: day(Math.min(start + (WINDOW_DAYS - 1) * DAY_MS, end)) });
    }
    setBackfill({ done: 0, total: windows.length });
    try {
      for (const [i, window] of windows.entries()) {
        await unwrap(crm.analytics.sync.$post({ json: window }));
        setBackfill({ done: i + 1, total: windows.length });
      }
      toast.success("Backfill complete");
    } catch (error) {
      toast.error(`Backfill stopped: ${errorMessage(error)}`);
    } finally {
      setBackfill(null);
      onSynced();
    }
  }

  const busy = sync.pending || backfill !== null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <span className="font-medium">{data.property}</span>
        <span className="text-muted-foreground">
          {" · "}
          {data.last_sync ? `Last synced ${formatWhen(data.last_sync.at)}` : "Never synced"}
          {data.range ? ` · Data to ${data.range.end}` : ""}
        </span>
        {backfill && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-1.5 w-40 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${(backfill.done / backfill.total) * 100}%` }} />
            </div>
            Backfilling {backfill.done} of {backfill.total}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={consoleUrl} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm hover:bg-muted">
          Search Console <ExternalLink className="h-4 w-4" />
        </a>
        {isAdmin && data.configured && (
          <>
            <Button variant="outline" disabled={busy} onClick={runBackfill}>
              Backfill 16 months
            </Button>
            <Button pending={sync.pending} disabled={busy} onClick={syncNow}>
              <RefreshCw className="h-4 w-4" /> Sync now
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function SetupGuide({ property }: { property: string }) {
  return (
    <Card title="Connect Search Console">
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed">
        <li>
          In Google Cloud, create a service account and download its JSON key. Enable the <b>Google Search Console API</b> on that project.
        </li>
        <li>
          In Search Console, open <b>{property}</b> → Settings → Users and permissions, and add the service account's email (…@….iam.gserviceaccount.com) as a <b>Restricted</b> user.
        </li>
        <li>
          Save the key as the Worker secret <code className="rounded bg-muted px-1.5 py-0.5 text-xs">GSC_SERVICE_ACCOUNT_JSON</code>, then come back here and press <b>Backfill 16 months</b>.
        </li>
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">After that, the dashboard syncs the last few days automatically every night.</p>
    </Card>
  );
}

type SortKey = "clicks" | "impressions" | "position";

function RankTable({ title, lede, rows, column, formatKey = (k) => k, initialSort = "clicks" }: { title: string; lede?: string; rows: Row[]; column: string; formatKey?: (key: string) => string; initialSort?: SortKey }) {
  const [sort, setSort] = React.useState<SortKey>(initialSort);
  const sorted = [...rows].sort((a, b) => (sort === "position" ? a.position - b.position : b[sort] - a[sort]));
  const max = Math.max(1, ...rows.map((r) => (sort === "position" ? 0 : r[sort])));
  return (
    <Card
      title={title}
      bodyClassName="p-0"
      actions={
        <Select
          aria-label={`Sort ${title}`}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          options={[
            { value: "clicks", label: "By clicks" },
            { value: "impressions", label: "By impressions" },
            { value: "position", label: "By position" },
          ]}
          className="h-9 w-40"
        />
      }
    >
      {lede && <p className="px-4 pt-3 text-xs text-muted-foreground">{lede}</p>}
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Nothing in this period.</p>
      ) : (
        <Table className="rounded-none border-0">
          <thead>
            <tr>
              <Th>{column}</Th>
              <Th className="text-right">Clicks</Th>
              <Th className="text-right">Impr.</Th>
              <Th className="text-right">CTR</Th>
              <Th className="text-right">Position</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 50).map((row) => (
              <Tr key={row.key}>
                <Td className="max-w-[18rem]">
                  <div className="truncate" title={row.key}>
                    {formatKey(row.key)}
                  </div>
                  {sort !== "position" && (
                    <div className="mt-1 h-1 rounded bg-muted">
                      <div className="h-full rounded bg-primary" style={{ width: `${(row[sort] / max) * 100}%` }} />
                    </div>
                  )}
                </Td>
                <Td className="text-right tabular-nums">{formatNumber(row.clicks)}</Td>
                <Td className="text-right tabular-nums">{formatNumber(row.impressions)}</Td>
                <Td className="text-right tabular-nums">{(row.ctr * 100).toFixed(1)}%</Td>
                <Td className="text-right">
                  <Badge tone={positionTone(row.position)}>{row.position.toFixed(1)}</Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

const positionTone = (position: number): Tone => (position <= 3 ? "success" : position <= 10 ? "info" : position <= 20 ? "warning" : "neutral");

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function pagePath(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

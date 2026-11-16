import React from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import type { InferResponseType } from "hono/client";
import { CHANNEL_LABELS, ENQUIRY_LABELS, type Channel } from "@worker/site-analytics/fields";
import { crm, unwrap } from "@/lib/api";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { QueryView, Spinner, useQuery, useSearchState } from "@/lib/hooks";
import { Select } from "@/ui/form";
import { Card, EmptyState, PageHeader } from "@/ui/layout";
import { Table, Td, Th, Tr } from "@/ui/table";
import { cn } from "@/ui/cn";

const TrafficChart = React.lazy(() => import("./TrafficChart"));

type Report = InferResponseType<(typeof crm)["site-analytics"]["$get"], 200>;
type Breakdown = Report["sources"][number];
type Days = "7" | "28" | "90" | "365";
const PERIODS: { value: Days; label: string }[] = [
  { value: "7", label: "Last 7 days" },
  { value: "28", label: "Last 28 days" },
  { value: "90", label: "Last 3 months" },
  { value: "365", label: "Last 12 months" },
];

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (code: string | null) => {
  if (!code || code === "XX" || code === "T1") return "Unknown";
  try {
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
};
const rate = (part: number, whole: number) => (whole ? part / whole : null);

export function SiteAnalyticsPage() {
  const [params, setParams] = useSearchState<"days">();
  const days = (PERIODS.some((p) => p.value === params.days) ? params.days : "28") as Days;
  const report = useQuery(() => unwrap(crm["site-analytics"].$get({ query: { days } })), days);
  const website = useQuery(() => unwrap(crm.website.$get()));
  const site = website.status === "ready" ? website.data.site_url.replace(/\/$/, "") : "";

  return (
    <>
      <PageHeader
        title="Site analytics"
        lede="Visits and enquiries on bestbuilderdeveloper.com. Visitors are counted without cookies; a person is counted once per day."
        actions={<Select aria-label="Period" value={days} options={PERIODS} onChange={(e) => setParams({ days: e.target.value })} className="w-44" />}
      />
      <QueryView query={report}>{(data) => <ReportBody data={data} site={site} />}</QueryView>
    </>
  );
}

function ReportBody({ data, site }: { data: Report; site: string }) {
  if (!data.totals.pageviews)
    return (
      <EmptyState title="No visits recorded yet">
        The site starts counting visits, WhatsApp and call taps and lead forms as soon as the landing site with the tracker is deployed. No cookies are used, so no banner is needed.
      </EmptyState>
    );
  const { totals: t, previous: p } = data;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {formatDate(`${data.range.start}T12:00:00Z`)} – {formatDate(`${data.range.end}T12:00:00Z`)} · PKT, compared with the previous {data.daily.length} days
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Visitors" value={formatNumber(t.visitors)} now={t.visitors} before={p.visitors} />
        <Tile label="Pageviews" value={formatNumber(t.pageviews)} now={t.pageviews} before={p.pageviews} />
        <Tile label="Enquiries" value={formatNumber(t.enquiries)} now={t.enquiries} before={p.enquiries} hint="WhatsApp, calls and lead forms" />
        <Tile
          label="Conversion rate"
          value={formatPercent(rate(t.converting_sessions, t.sessions), 1)}
          now={rate(t.converting_sessions, t.sessions)}
          before={rate(p.converting_sessions, p.sessions)}
          points
          hint="Visits that sent an enquiry"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="Daily traffic">
          <React.Suspense fallback={<Spinner className="py-24" />}>
            <TrafficChart data={data.daily} />
          </React.Suspense>
        </Card>
        <Card title="Enquiries">
          <BarList
            rows={(["whatsapp", "call", "form"] as const).map((kind) => ({ label: ENQUIRY_LABELS[kind], value: data.enquiries.find((e) => e.kind === kind)?.count ?? 0 }))}
          />
        </Card>
      </div>

      <SourcesCard data={data} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top pages" bodyClassName="p-0">
          <Table className="rounded-none border-0">
            <thead>
              <tr>
                <Th>Page</Th>
                <Th className="text-right">Views</Th>
                <Th className="text-right">Visitors</Th>
                <Th className="text-right">Enquiries</Th>
              </tr>
            </thead>
            <tbody>
              {data.pages.map((page) => (
                <Tr key={page.path}>
                  <Td className="max-w-[16rem]">
                    <a href={`${site}${page.path}`} target="_blank" rel="noopener" className="inline-flex max-w-full items-center gap-1 hover:underline">
                      <span className="truncate">{page.path}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </a>
                  </Td>
                  <Td className="text-right tabular-nums">{formatNumber(page.pageviews)}</Td>
                  <Td className="text-right tabular-nums">{formatNumber(page.visitors)}</Td>
                  <Td className="text-right tabular-nums">{formatNumber(page.enquiries)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Properties" bodyClassName="p-0">
          {data.properties.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No property pages viewed in this period.</p>
          ) : (
            <Table className="rounded-none border-0">
              <thead>
                <tr>
                  <Th>Property</Th>
                  <Th className="text-right">Views</Th>
                  <Th className="text-right">Enquiries</Th>
                  <Th className="text-right">Conversion</Th>
                </tr>
              </thead>
              <tbody>
                {data.properties.map((row) => (
                  <Tr key={row.slug}>
                    <Td className="max-w-[16rem]">
                      {row.property_id ? (
                        <Link to={`/inventory/${row.property_id}?tab=website`} className="block truncate hover:underline">
                          {row.title ?? row.slug}
                        </Link>
                      ) : (
                        <span className="block truncate text-muted-foreground">{row.title ?? row.slug}</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{formatNumber(row.pageviews)}</Td>
                    <Td className="text-right tabular-nums">{formatNumber(row.enquiries)}</Td>
                    <Td className="text-right tabular-nums">{formatPercent(rate(row.enquiries, row.pageviews), 1)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Countries">
          <BarList rows={data.countries.map((c) => ({ label: countryName(c.key), value: c.sessions }))} />
        </Card>
        <Card title="Devices">
          <BarList rows={data.devices.map((d) => ({ label: d.key ? d.key.charAt(0).toUpperCase() + d.key.slice(1) : "Unknown", value: d.sessions }))} />
        </Card>
      </div>
    </div>
  );
}

function Tile({ label, value, now, before, hint, points }: { label: string; value: string; now: number | null; before: number | null; hint?: string; points?: boolean }) {
  let delta: { text: string; good: boolean } | null = null;
  if (now != null && before != null) {
    if (points) delta = { text: `${now >= before ? "+" : ""}${((now - before) * 100).toFixed(1)} pts`, good: now >= before };
    else if (before > 0) delta = { text: `${now >= before ? "+" : ""}${Math.round(((now - before) / before) * 100)}%`, good: now >= before };
    else if (now > 0) delta = { text: "New", good: true };
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="label-caps">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
        {delta && <span className={cn("font-medium", delta.good ? "text-success" : "text-destructive")}>{delta.text}</span>}
        <span className="text-muted-foreground">{delta ? "vs previous period" : hint}</span>
      </div>
    </div>
  );
}

const TABS = [
  { value: "channels", label: "Channels" },
  { value: "sources", label: "Sources" },
  { value: "campaigns", label: "Campaigns" },
] as const;

function SourcesCard({ data }: { data: Report }) {
  const [tab, setTab] = React.useState<(typeof TABS)[number]["value"]>("channels");
  const tabs = TABS.filter((t) => t.value !== "campaigns" || data.campaigns.length > 0);
  const rows: { label: string; row: Breakdown }[] =
    tab === "channels"
      ? data.channels.map((row) => ({ label: CHANNEL_LABELS[row.key as Channel] ?? row.key ?? "Unknown", row }))
      : tab === "sources"
        ? data.sources.map((row) => ({ label: row.key ?? "Direct / none", row }))
        : data.campaigns.map((row) => ({ label: row.key ?? "", row }));
  const max = Math.max(1, ...rows.map((r) => r.row.sessions));

  return (
    <Card
      title="Traffic sources"
      bodyClassName="p-0"
      actions={
        <div className="flex rounded-md border border-border p-0.5" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn("rounded px-3 py-1.5 text-xs font-medium", tab === t.value ? "bg-primary-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      <Table className="rounded-none border-0">
        <thead>
          <tr>
            <Th>{TABS.find((t) => t.value === tab)!.label.slice(0, -1)}</Th>
            <Th>Visits</Th>
            <Th className="text-right">Enquiries</Th>
            <Th className="text-right">Conversion</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, row }) => (
            <Tr key={`${tab}-${row.key ?? "none"}`}>
              <Td className="max-w-[14rem] truncate">{label}</Td>
              <Td className="min-w-[8rem]">
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${(row.sessions / max) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right tabular-nums">{formatNumber(row.sessions)}</span>
                </div>
              </Td>
              <Td className="text-right tabular-nums">{formatNumber(row.enquiries)}</Td>
              <Td className="text-right tabular-nums">{formatPercent(rate(row.converting_sessions, row.sessions), 1)}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nothing in this period.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row.label} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="truncate">{row.label}</span>
            <span className="tabular-nums text-muted-foreground">{formatNumber(row.value)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

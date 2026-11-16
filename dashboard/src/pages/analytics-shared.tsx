import { useSearchState } from "@/lib/hooks";
import { Select } from "@/ui/form";
import { cn } from "@/ui/cn";

export type Delta = { text: string; good: boolean };
type Period<D extends string> = { value: D; label: string };

/** The `?days=` period from the URL, falling back to 28 days. */
export function usePeriod<D extends string>(periods: readonly Period<D>[]): [D, (days: D) => void] {
  const [params, setParams] = useSearchState<"days">();
  const days = (periods.find((p) => p.value === params.days)?.value ?? "28") as D;
  return [days, (next) => setParams({ days: next })];
}

export function PeriodSelect<D extends string>({ periods, value, onChange }: { periods: readonly Period<D>[]; value: D; onChange: (days: D) => void }) {
  return <Select aria-label="Period" value={value} options={periods} onChange={(e) => onChange(e.target.value as D)} className="w-44" />;
}

export function percentChange(now: number, before: number): Delta | null {
  if (!before) return now > 0 ? { text: "New", good: true } : null;
  const pct = ((now - before) / before) * 100;
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, good: pct >= 0 };
}

/** Change between two rates, in percentage points. */
export const pointsChange = (now: number | null, before: number | null): Delta | null =>
  now == null || before == null ? null : { text: `${now >= before ? "+" : ""}${((now - before) * 100).toFixed(1)} pts`, good: now >= before };

export function DeltaTile({ label, value, delta, hint }: { label: string; value: string; delta: Delta | null; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="label-caps">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
        {delta && <span className={cn("font-medium", delta.good ? "text-success" : "text-destructive")}>{delta.text}</span>}
        <span className="text-muted-foreground">{delta ? "vs previous period" : (hint ?? "No earlier data")}</span>
      </div>
    </div>
  );
}

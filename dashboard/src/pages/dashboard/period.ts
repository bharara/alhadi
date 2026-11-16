export const PERIODS = [
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "custom", label: "Custom range", days: 0 },
] as const;

export type PeriodValue = (typeof PERIODS)[number]["value"];

const DAY_MS = 86_400_000;
const MAX_DAYS = 365;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const dayStart = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export type Range = { period: PeriodValue; start: string; end: string };

/** The UTC date range for the URL's period, custom ranges clamped to 365 days and ordered. */
export function resolveRange(period: string | undefined, from: string | undefined, to: string | undefined): Range {
  const today = isoDay(new Date());
  if (period === "custom" && from && to && DATE_RE.test(from) && DATE_RE.test(to)) {
    let [start, end] = from <= to ? [from, to] : [to, from];
    if (end > today) end = today;
    if (start > end) start = end;
    const earliest = isoDay(new Date(dayStart(end).getTime() - (MAX_DAYS - 1) * DAY_MS));
    if (start < earliest) start = earliest;
    return { period: "custom", start, end };
  }
  const preset = PERIODS.find((p) => p.value === period && p.days > 0) ?? PERIODS[2];
  return { period: preset.value, start: isoDay(new Date(dayStart(today).getTime() - (preset.days - 1) * DAY_MS)), end: today };
}

/** [start 00:00, end + 1 day 00:00) in UTC, as ISO instants for the prospect filters. */
export function rangeInstants(range: Range): { after: string; before: string } {
  return { after: dayStart(range.start).toISOString(), before: new Date(dayStart(range.end).getTime() + DAY_MS).toISOString() };
}

const label = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const formatRange = (range: Range) =>
  range.start === range.end ? label.format(dayStart(range.start)) : `${label.format(dayStart(range.start))} – ${label.format(dayStart(range.end))}`;

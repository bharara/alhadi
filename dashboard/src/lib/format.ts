import { fromPktWallTime, TIME_ZONE, toPktWallTime } from "@worker/time";

const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE });
const timeOnly = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE });
const dateOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE });
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

// "in 2 hours · 15:00" within a week, otherwise "5 Mar 2026, 15:00".
export function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs > 7 * 86_400_000) return dateTime.format(date);
  const [amount, unit] =
    abs < 3_600_000 ? [Math.round(diff / 60_000), "minute"] : abs < 86_400_000 ? [Math.round(diff / 3_600_000), "hour"] : [Math.round(diff / 86_400_000), "day"];
  return `${relative.format(amount, unit as Intl.RelativeTimeFormatUnit)} · ${timeOnly.format(date)}`;
}

export const formatDate = (value: string | null | undefined) => (value ? dateOnly.format(new Date(value)) : "—");

export const formatNumber = (value: number) => value.toLocaleString("en-US");

export const formatPercent = (value: number | null | undefined, digits = 0) => (value == null ? "N/A" : `${(value * 100).toFixed(digits)}%`);

export const titleFromKey = (key: string) => key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const truncate = (value: string | null | undefined, max = 100) => (!value ? "" : value.length > max ? `${value.slice(0, max - 1)}…` : value);

export const toLocalInput = (value: string | null | undefined) => (value ? toPktWallTime(value) : "");

export const fromLocalInput = (value: string) => (value ? fromPktWallTime(value).toISOString() : null);

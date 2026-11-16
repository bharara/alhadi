import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendRow } from "./types";

export const SERIES = [
  { key: "calls", label: "Calls", color: "#1677ff" },
  { key: "whatsapp", label: "WhatsApp", color: "#52c41a" },
  { key: "visits", label: "Visits", color: "#faad14" },
  { key: "unique_contacted", label: "People contacted", color: "#722ed1" },
] as const;

const tick = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const formatBucket = (bucket: string) => tick.format(new Date(`${bucket}T00:00:00.000Z`));

/** Loaded lazily so recharts stays out of the main bundle. */
export default function TrendChart({ rows, weekly }: { rows: TrendRow[]; weekly: boolean }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="bucket" tickFormatter={formatBucket} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={12} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            labelFormatter={(bucket) => (weekly ? `Week of ${formatBucket(String(bucket))}` : formatBucket(String(bucket)))}
            contentStyle={{ borderRadius: 8, borderColor: "hsl(var(--border))", fontSize: 12 }}
            cursor={{ fill: "hsl(var(--muted))" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          {SERIES.map((series) => (
            <Bar key={series.key} dataKey={series.key} name={series.label} fill={series.color} radius={[3, 3, 0, 0]} maxBarSize={18} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DailyPoint = { date: string; clicks: number; impressions: number };

const CLICKS = "hsl(41 87% 45%)";
const IMPRESSIONS = "hsl(216 60% 35%)";
const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default function DailyChart({ data }: { data: DailyPoint[] }) {
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-3 rounded-sm" style={{ background: CLICKS }} /> Clicks
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-3 rounded-sm" style={{ background: IMPRESSIONS }} /> Impressions
        </span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="hsl(220 27% 91%)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis yAxisId="clicks" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis yAxisId="impressions" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip labelFormatter={(label) => shortDate(String(label))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Line yAxisId="clicks" type="monotone" dataKey="clicks" name="Clicks" stroke={CLICKS} strokeWidth={2} dot={false} />
            <Line yAxisId="impressions" type="monotone" dataKey="impressions" name="Impressions" stroke={IMPRESSIONS} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

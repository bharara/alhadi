import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DailyPoint = { day: string; visits: number; pageviews: number; enquiries: number };

const VISITS = "hsl(216 60% 35%)";
const PAGEVIEWS = "hsl(216 40% 78%)";
const ENQUIRIES = "hsl(41 87% 45%)";
const shortDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default function TrafficChart({ data }: { data: DailyPoint[] }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {[
          ["Pageviews", PAGEVIEWS],
          ["Visits", VISITS],
          ["Enquiries", ENQUIRIES],
        ].map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <i className="h-2 w-3 rounded-sm" style={{ background: color }} /> {label}
          </span>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="hsl(220 27% 91%)" vertical={false} />
            <XAxis dataKey="day" tickFormatter={shortDate} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis yAxisId="traffic" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis yAxisId="enquiries" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip labelFormatter={(label) => shortDate(String(label))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar yAxisId="traffic" dataKey="pageviews" name="Pageviews" fill={PAGEVIEWS} radius={[2, 2, 0, 0]} />
            <Bar yAxisId="traffic" dataKey="visits" name="Visits" fill={VISITS} radius={[2, 2, 0, 0]} />
            <Line yAxisId="enquiries" type="monotone" dataKey="enquiries" name="Enquiries" stroke={ENQUIRIES} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

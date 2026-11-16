import { Hono } from "hono";
import { z } from "zod";
import { all, parseJson } from "../db";
import type { AuthedEnv } from "../env";
import { ApiError } from "../http";
import { isoDate, zQuery } from "../validation";

const ACTIVITY_KINDS = ["call", "whatsapp", "visit"] as const;
type ActivityKind = (typeof ACTIVITY_KINDS)[number];
const UNASSIGNED = "Unassigned / unknown";
const DAY_MS = 86_400_000;

type ReportUser = { id: string; username: string };
type ProspectRow = { id: string; assigned_user_id: string | null; tags: string; status: string };
type TouchRow = { prospect_id: string; touching_user_id: string; kind: ActivityKind; occurred_at: string };
type Funnel = { cohort_size: number; cold: number; warm: number; hot: number; dnc: number; visited: number; visit_rate: number | null };

const rate = (value: number, total: number) => (total ? Math.round((value / total) * 10000) / 10000 : null);

export const reportRoutes = new Hono<AuthedEnv>().get(
  "/report",
  zQuery(z.object({ start_date: isoDate, end_date: isoDate })),
  async (c) => {
    const { start_date, end_date } = c.req.valid("query");
    const start = new Date(`${start_date}T00:00:00.000Z`);
    const end = new Date(new Date(`${end_date}T00:00:00.000Z`).getTime() + DAY_MS);
    if (start >= end) throw new ApiError(422, "start_date must be on or before end_date");
    const spanDays = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    if (spanDays > 365) throw new ApiError(422, "The date range can be at most 365 days");
    const db = c.env.DB;
    const window = [start.toISOString(), end.toISOString()];

    const [reportUsers, prospects, touches] = await Promise.all([
      all<ReportUser>(db, "SELECT id, username FROM users WHERE is_active = 1 AND role != 'admin' ORDER BY username"),
      all<ProspectRow>(db, "SELECT id, assigned_user_id, tags, status FROM prospects WHERE created_at >= ? AND created_at < ?", window),
      all<TouchRow>(
        db,
        `SELECT prospect_id, touching_user_id, kind, occurred_at FROM prospect_touches
         WHERE occurred_at >= ? AND occurred_at < ? AND kind IN ('call', 'whatsapp', 'visit')`,
        window,
      ),
    ]);
    const reportIds = new Set(reportUsers.map((u) => u.id));
    const bucketOf = (id: string | null) => (id && reportIds.has(id) ? id : null);

    const contacted = new Set(touches.map((t) => t.prospect_id));
    const visited = new Set(touches.filter((t) => t.kind === "visit").map((t) => t.prospect_id));
    const assigned = prospects.filter((p) => p.assigned_user_id).length;

    const activity = new Map<string | null, Record<ActivityKind, number>>();
    for (const touch of touches) {
      const key = bucketOf(touch.touching_user_id);
      const counts = activity.get(key) ?? { call: 0, whatsapp: 0, visit: 0 };
      counts[touch.kind] += 1;
      activity.set(key, counts);
    }
    const activityRow = (id: string | null, username: string) => {
      const counts = activity.get(id) ?? { call: 0, whatsapp: 0, visit: 0 };
      return { user_id: id, username, calls: counts.call, whatsapp: counts.whatsapp, visits: counts.visit, total: counts.call + counts.whatsapp + counts.visit };
    };
    const activityRows = reportUsers.map((u) => activityRow(u.id, u.username));
    const unknownActivity = activityRow(null, UNASSIGNED);
    if (unknownActivity.total > 0) activityRows.push(unknownActivity);

    const cohort = new Map<string | null, ProspectRow[]>();
    for (const prospect of prospects) {
      const key = bucketOf(prospect.assigned_user_id);
      const members = cohort.get(key) ?? [];
      members.push(prospect);
      cohort.set(key, members);
    }
    const cohortRow = (id: string | null, username: string) => {
      const members = cohort.get(id) ?? [];
      const reached = members.filter((p) => contacted.has(p.id)).length;
      const seen = members.filter((p) => visited.has(p.id)).length;
      return { user_id: id, username, cohort_size: members.length, contacted: reached, visited: seen, contact_rate: rate(reached, members.length), visit_rate: rate(seen, members.length) };
    };
    const cohortRows = reportUsers.map((u) => cohortRow(u.id, u.username));
    if ((cohort.get(null)?.length ?? 0) > 0) cohortRows.push(cohortRow(null, UNASSIGNED));

    // Campaign cohort: each tag is a campaign; status counts only include contacted prospects.
    const campaigns = new Map<string, { all: Funnel; people: Map<string | null, Funnel> }>();
    const emptyFunnel = (): Funnel => ({ cohort_size: 0, cold: 0, warm: 0, hot: 0, dnc: 0, visited: 0, visit_rate: null });
    const addTo = (funnel: Funnel, prospect: ProspectRow) => {
      funnel.cohort_size += 1;
      if (visited.has(prospect.id)) funnel.visited += 1;
      if (contacted.has(prospect.id)) {
        if (prospect.status === "interested") funnel.hot += 1;
        else if (prospect.status === "warm") funnel.warm += 1;
        else if (prospect.status === "do_not_contact") funnel.dnc += 1;
        else funnel.cold += 1;
      }
    };
    for (const prospect of prospects) {
      const tags = parseJson<string[]>(prospect.tags, []);
      for (const tag of tags.length ? tags : ["Untagged"]) {
        const campaign = campaigns.get(tag) ?? { all: emptyFunnel(), people: new Map() };
        addTo(campaign.all, prospect);
        const person = bucketOf(prospect.assigned_user_id);
        const funnel = campaign.people.get(person) ?? emptyFunnel();
        addTo(funnel, prospect);
        campaign.people.set(person, funnel);
        campaigns.set(tag, campaign);
      }
    }
    const withRate = (f: Funnel): Funnel => ({ ...f, visit_rate: rate(f.visited, f.cohort_size) });
    const campaignRows = [...campaigns.entries()]
      .map(([name, { all: funnel, people }]) => ({
        campaign: name,
        ...withRate(funnel),
        salespeople: [
          ...reportUsers.filter((u) => people.has(u.id)).map((u) => ({ user_id: u.id as string | null, username: u.username, ...withRate(people.get(u.id)!) })),
          ...(people.has(null) ? [{ user_id: null, username: UNASSIGNED, ...withRate(people.get(null)!) }] : []),
        ],
      }))
      .sort((a, b) => b.cohort_size - a.cohort_size || a.campaign.localeCompare(b.campaign));

    // Trend: daily buckets up to 30 days, otherwise weeks starting Monday.
    const weekly = spanDays > 30;
    const bucketLabel = (iso: string) => {
      const day = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
      if (weekly) day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
      return day.toISOString().slice(0, 10);
    };
    const trend = new Map<string, { bucket: string; calls: number; whatsapp: number; visits: number; people: Set<string> }>();
    for (let t = new Date(bucketLabel(start.toISOString())).getTime(); t < end.getTime(); t += (weekly ? 7 : 1) * DAY_MS) {
      const bucket = new Date(t).toISOString().slice(0, 10);
      trend.set(bucket, { bucket, calls: 0, whatsapp: 0, visits: 0, people: new Set() });
    }
    for (const touch of touches) {
      const bucket = trend.get(bucketLabel(touch.occurred_at));
      if (!bucket) continue;
      if (touch.kind === "call") bucket.calls += 1;
      else if (touch.kind === "whatsapp") bucket.whatsapp += 1;
      else bucket.visits += 1;
      bucket.people.add(touch.prospect_id);
    }

    return c.json({
      kpis: {
        prospects_in_scope: prospects.length,
        assigned_prospects: assigned,
        unique_contacted: contacted.size,
        unique_visited: visited.size,
        total_activities: touches.length,
        reach_rate: rate(contacted.size, assigned),
        visit_conversion: rate(visited.size, assigned),
      },
      activity: activityRows,
      cohort: cohortRows,
      campaign_cohort: campaignRows,
      trend: [...trend.values()].map(({ people, ...rest }) => ({ ...rest, unique_contacted: people.size })),
    });
  },
);

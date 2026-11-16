import type { InferResponseType } from "hono/client";
import { crm } from "@/lib/api";

export type Report = InferResponseType<typeof crm.dashboard.report.$get, 200>;
export type ActivityRow = Report["activity"][number];
export type CohortRow = Report["cohort"][number];
export type CampaignRow = Report["campaign_cohort"][number];
export type TrendRow = Report["trend"][number];

/** A drill-down target: a salesperson, or the unassigned bucket when the id is null. */
export type Drill = { userId: string | null };

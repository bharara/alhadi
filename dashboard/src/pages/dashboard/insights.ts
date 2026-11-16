import { formatPercent } from "@/lib/format";
import type { Drill, Report } from "./types";

export type Insight = { tone: "info" | "success" | "warning"; title: string; text: string; drill?: Drill };

const MIN_COHORT = 10;
const HIGH_ACTIVITY = 10;
const LOW_REACH = 0.5;

/** Plain-language highlights for a manager, from the report alone. */
export function buildManagerInsights(report: Report): Insight[] {
  const insights: Insight[] = [];
  const people = report.activity.filter((row) => row.user_id !== null);
  const cohortByUser = new Map(report.cohort.map((row) => [row.user_id, row]));

  const busiest = [...people].sort((a, b) => b.total - a.total)[0];
  if (busiest && busiest.total >= HIGH_ACTIVITY) {
    insights.push({
      tone: "info",
      title: "Highest activity volume",
      text: `${busiest.username} logged ${busiest.total} activities (${busiest.calls} calls, ${busiest.whatsapp} WhatsApp, ${busiest.visits} visits).`,
      drill: { userId: busiest.user_id },
    });
  }

  const converting = report.cohort
    .filter((row) => row.user_id !== null && row.cohort_size >= MIN_COHORT && (row.visit_rate ?? 0) > 0)
    .sort((a, b) => (b.visit_rate ?? 0) - (a.visit_rate ?? 0))[0];
  if (converting) {
    insights.push({
      tone: "success",
      title: "Highest visit conversion",
      text: `${converting.username} turned ${formatPercent(converting.visit_rate)} of ${converting.cohort_size} new prospects into site visits.`,
      drill: { userId: converting.user_id },
    });
  }

  const gap = [...report.cohort].sort((a, b) => b.cohort_size - b.contacted - (a.cohort_size - a.contacted))[0];
  if (gap && gap.cohort_size - gap.contacted > 0) {
    insights.push({
      tone: "warning",
      title: "Largest follow-up gap",
      text: `${gap.username} has ${gap.cohort_size - gap.contacted} of ${gap.cohort_size} new prospects not contacted yet.`,
      drill: { userId: gap.user_id },
    });
  }

  const campaigns = report.campaign_cohort;
  const topCampaign = campaigns
    .filter((row) => row.cohort_size >= MIN_COHORT && (row.visit_rate ?? 0) > 0)
    .sort((a, b) => (b.visit_rate ?? 0) - (a.visit_rate ?? 0))[0];
  if (topCampaign) {
    insights.push({
      tone: "success",
      title: "Top campaign visit conversion",
      text: `${topCampaign.campaign}: ${formatPercent(topCampaign.visit_rate)} of ${topCampaign.cohort_size} prospects visited.`,
    });
  }

  const contactedIn = (row: (typeof campaigns)[number]) => row.cold + row.warm + row.hot + row.dnc;
  const campaignGap = [...campaigns].sort((a, b) => b.cohort_size - contactedIn(b) - (a.cohort_size - contactedIn(a)))[0];
  if (campaignGap && campaignGap.cohort_size - contactedIn(campaignGap) > 0) {
    insights.push({
      tone: "warning",
      title: "Largest campaign follow-up gap",
      text: `${campaignGap.campaign} has ${campaignGap.cohort_size - contactedIn(campaignGap)} of ${campaignGap.cohort_size} prospects not contacted yet.`,
    });
  }

  const largest = campaigns[0];
  if (largest && campaigns.length > 1) {
    insights.push({ tone: "info", title: "Largest campaign cohort", text: `${largest.campaign} brought in ${largest.cohort_size} new prospects.` });
  }

  for (const row of people) {
    if (row.calls >= HIGH_ACTIVITY && row.visits === 0) {
      insights.push({
        tone: "warning",
        title: "Calls without visits",
        text: `${row.username} made ${row.calls} calls but recorded no site visits.`,
        drill: { userId: row.user_id },
      });
    }
    const reach = cohortByUser.get(row.user_id)?.contact_rate;
    if (row.whatsapp >= HIGH_ACTIVITY && reach != null && reach < LOW_REACH) {
      insights.push({
        tone: "warning",
        title: "WhatsApp with low reach",
        text: `${row.username} sent ${row.whatsapp} WhatsApp messages but reached only ${formatPercent(reach)} of their new prospects.`,
        drill: { userId: row.user_id },
      });
    }
  }

  return insights;
}

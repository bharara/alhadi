import type { ExecutionContext, ScheduledController } from "@cloudflare/workers-types";
import { recentRange, searchConsoleConfigured, syncSearchConsole } from "./analytics/sync";
import { app } from "./app";
import type { Env } from "./env";
import { deleteOldEvents } from "./site-analytics/retention";
import { processSiteRebuild } from "./site-build";

// Keys must match "triggers.crons" in wrangler.jsonc.
const CRON_JOBS: Record<string, (env: Env) => Promise<void>> = {
  // Independent jobs: one failing doesn't skip the other.
  "30 2 * * *": async (env) => {
    const range = recentRange(5);
    const results = await Promise.allSettled([deleteOldEvents(env.DB), searchConsoleConfigured(env) ? syncSearchConsole(env, range.start, range.end) : null]);
    for (const result of results) if (result.status === "rejected") console.error("[cron] nightly job failed", result.reason);
  },
  "*/5 * * * *": processSiteRebuild,
};

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const job = CRON_JOBS[controller.cron];
    if (!job) throw new Error(`No job for cron ${controller.cron}`);
    ctx.waitUntil(job(env));
  },
};

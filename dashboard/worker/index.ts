import type { ExecutionContext, ScheduledController } from "@cloudflare/workers-types";
import { recordSync } from "./analytics/routes";
import { recentRange, searchConsoleConfigured, syncSearchConsole } from "./analytics/sync";
import { app } from "./app";
import type { Env } from "./env";
import { processSiteRebuild } from "./website/rebuild";

// Keys must match "triggers.crons" in wrangler.jsonc.
const CRON_JOBS: Record<string, (env: Env) => Promise<void>> = {
  "30 2 * * *": async (env) => {
    if (!searchConsoleConfigured(env)) return;
    const range = recentRange(5);
    await syncSearchConsole(env, range.start, range.end);
    await recordSync(env.DB, range);
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

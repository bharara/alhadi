import type { ExecutionContext, ScheduledController } from "@cloudflare/workers-types";
import { recordSync } from "./analytics/routes";
import { recentRange, searchConsoleConfigured, syncSearchConsole } from "./analytics/sync";
import { app } from "./app";
import type { Env } from "./env";

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!searchConsoleConfigured(env)) return;
    const range = recentRange(5);
    ctx.waitUntil(syncSearchConsole(env, range.start, range.end).then(() => recordSync(env.DB, range)));
  },
};

import { first, nowIso, run, type Db } from "../db";
import type { Env } from "../env";
import { purgePublicListings } from "./public";

// Listing pages are static, so publishing changes rebuild the landing site.
// Edits within DEBOUNCE_MS of each other share one build; a cron starts it.
const KEY = "site_rebuild";
const DEBOUNCE_MS = 2 * 60 * 1000;

export type RebuildState = {
  requested_at: string | null;
  triggered_at: string | null;
  deployment_url: string | null;
  error: string | null;
};

const EMPTY: RebuildState = { requested_at: null, triggered_at: null, deployment_url: null, error: null };

export async function readRebuildState(db: Db): Promise<RebuildState> {
  const row = await first<{ value: string }>(db, "SELECT value FROM site_settings WHERE key = ?", [KEY]);
  return row ? { ...EMPTY, ...(JSON.parse(row.value) as Partial<RebuildState>) } : EMPTY;
}

async function writeRebuildState(db: Db, state: RebuildState): Promise<void> {
  await run(db, "INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [
    KEY,
    JSON.stringify(state),
    nowIso(),
  ]);
}

/** Marks the site as needing a rebuild and refreshes the live listing cards right away. */
export async function requestSiteRebuild(env: Env, requestUrl: string): Promise<void> {
  const state = await readRebuildState(env.DB);
  await Promise.all([writeRebuildState(env.DB, { ...state, requested_at: nowIso() }), purgePublicListings(requestUrl)]);
}

/** Cron: starts a build once edits have settled. */
export async function processSiteRebuild(env: Env): Promise<void> {
  const state = await readRebuildState(env.DB);
  if (!state.requested_at) return;
  if (Date.now() - Date.parse(state.requested_at) < DEBOUNCE_MS) return;
  await triggerSiteRebuild(env, state);
}

/** Starts a landing build now and clears the pending request. */
export async function triggerSiteRebuild(env: Env, state?: RebuildState): Promise<RebuildState> {
  const current = state ?? (await readRebuildState(env.DB));
  if (!env.PAGES_API_TOKEN) {
    const next = { ...current, error: "PAGES_API_TOKEN is not set, so the site can't be rebuilt automatically." };
    await writeRebuildState(env.DB, next);
    return next;
  }
  const form = new FormData();
  form.append("branch", env.LANDING_BRANCH);
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${env.LANDING_PROJECT}/deployments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.PAGES_API_TOKEN}` },
    body: form,
  });
  const data = (await response.json().catch(() => null)) as { success?: boolean; result?: { url?: string }; errors?: { message: string }[] } | null;
  const next: RebuildState = data?.success
    ? { requested_at: null, triggered_at: nowIso(), deployment_url: data.result?.url ?? null, error: null }
    : { ...current, error: `Pages build failed to start: ${data?.errors?.[0]?.message ?? response.status}` };
  await writeRebuildState(env.DB, next);
  return next;
}

import { nowIso, readSetting, run } from "./db";
import type { Env } from "./env";

// Property pages are static; edits settle for DEBOUNCE_MS before the cron starts one landing build.
const KEY = "site_rebuild";
const DEBOUNCE_MS = 2 * 60 * 1000;

type RebuildState = {
  requested_at: string | null;
  triggered_at: string | null;
  deployment_url: string | null;
  error: string | null;
};

const EMPTY: RebuildState = { requested_at: null, triggered_at: null, deployment_url: null, error: null };

export async function readRebuildState(db: Env["DB"]): Promise<RebuildState> {
  return { ...EMPTY, ...(await readSetting<Partial<RebuildState>>(db, KEY)) };
}

export async function requestSiteRebuild(env: Env): Promise<void> {
  const now = nowIso();
  await run(
    env.DB,
    `INSERT INTO site_settings (key, value, updated_at) VALUES (?1, json_object('requested_at', ?2), ?2)
     ON CONFLICT (key) DO UPDATE SET value = json_set(value, '$.requested_at', ?2), updated_at = ?2`,
    [KEY, now],
  );
}

export async function processSiteRebuild(env: Env): Promise<void> {
  const state = await readRebuildState(env.DB);
  if (state.requested_at && Date.now() - Date.parse(state.requested_at) >= DEBOUNCE_MS) await triggerSiteRebuild(env);
}

/** Starts a landing build now; a request made while it starts stays pending. */
export async function triggerSiteRebuild(env: Env): Promise<RebuildState> {
  const { requested_at: handled } = await readRebuildState(env.DB);
  let url: string | null;
  try {
    url = await startPagesBuild(env);
  } catch (error) {
    await run(
      env.DB,
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?1, json_object('error', ?2), ?3)
       ON CONFLICT (key) DO UPDATE SET value = json_set(value, '$.error', ?2), updated_at = ?3`,
      [KEY, (error as Error).message, nowIso()],
    );
    return readRebuildState(env.DB);
  }
  await run(
    env.DB,
    `UPDATE site_settings SET value = json_set(value,
       '$.requested_at', CASE WHEN json_extract(value, '$.requested_at') IS ?2 THEN NULL ELSE json_extract(value, '$.requested_at') END,
       '$.triggered_at', ?3, '$.deployment_url', ?4, '$.error', NULL), updated_at = ?3
     WHERE key = ?1`,
    [KEY, handled, nowIso(), url],
  );
  return readRebuildState(env.DB);
}

async function startPagesBuild(env: Env): Promise<string | null> {
  if (!env.PAGES_API_TOKEN) throw new Error("PAGES_API_TOKEN is not set, so the site can't be rebuilt automatically.");
  const form = new FormData();
  form.append("branch", env.LANDING_BRANCH);
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${env.LANDING_PROJECT}/deployments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.PAGES_API_TOKEN}` },
    body: form,
  });
  const data = (await response.json().catch(() => null)) as { success?: boolean; result?: { url?: string }; errors?: { message: string }[] } | null;
  if (!data?.success) throw new Error(`Pages build failed to start: ${data?.errors?.[0]?.message ?? response.status}`);
  return data.result?.url ?? null;
}

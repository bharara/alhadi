import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

export type Env = {
  DB: D1Database;
  /** Property photos; public at MEDIA_URL. */
  PHOTOS: R2Bucket;
  /** Caps analytics events per IP (wrangler.jsonc "ratelimits"). */
  COLLECT_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
  APP_URL: string;
  PUBLIC_SITE_URL: string;
  MEDIA_URL: string;
  GSC_PROPERTY: string;
  CF_ACCOUNT_ID: string;
  /** The Pages project and branch rebuilt when published properties change. */
  LANDING_PROJECT: string;
  LANDING_BRANCH: string;
  /** Signs session cookies. */
  SESSION_SECRET: string;
  /** Mixed into every password hash, so a copy of the database alone can't be cracked. */
  PASSWORD_PEPPER: string;
  /** Google service account key JSON with read access to the Search Console property. */
  GSC_SERVICE_ACCOUNT_JSON?: string;
  /** Cloudflare API token with Pages edit access, used to start landing builds. */
  PAGES_API_TOKEN?: string;
};

export type SessionUser = { id: string; username: string; role: "admin" | "member" };

export type WorkerEnv = { Bindings: Env };
export type AuthedEnv = { Bindings: Env; Variables: { user: SessionUser } };

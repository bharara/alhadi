import type { D1Database } from "@cloudflare/workers-types";

export type Env = {
  DB: D1Database;
  APP_URL: string;
  PUBLIC_SITE_URL: string;
  GSC_PROPERTY: string;
  /** Signs session cookies. */
  SESSION_SECRET: string;
  /** Mixed into every password hash, so a copy of the database alone can't be cracked. */
  PASSWORD_PEPPER: string;
  /** Google service account key JSON with read access to the Search Console property. */
  GSC_SERVICE_ACCOUNT_JSON?: string;
};

export type SessionUser = { id: string; username: string; role: "admin" | "member" };

export type WorkerEnv = { Bindings: Env };
export type AuthedEnv = { Bindings: Env; Variables: { user: SessionUser } };

import type { MiddlewareHandler } from "hono";
import { first } from "../db";
import type { Env } from "../env";
import { passwordFingerprint, readToken, type Subject } from "./tokens";

/** The admin an MCP call acts as, and the AI app they connected. */
export type Caller = { id: string; username: string; client_name: string };
export type McpEnv = { Bindings: Env; Variables: { caller: Caller } };

export async function passwordFingerprintOf(env: Env, userId: string): Promise<string | null> {
  const user = await first<{ password_hash: string }>(env.DB, "SELECT password_hash FROM users WHERE id = ?", [userId]);
  return user ? passwordFingerprint(user.password_hash) : null;
}

/** The token's user if still an active admin with the password they connected with; otherwise null. */
export async function liveAdmin(env: Env, subject: Subject): Promise<Caller | null> {
  const user = await first<{ id: string; username: string; role: string; is_active: number; password_hash: string }>(
    env.DB,
    "SELECT id, username, role, is_active, password_hash FROM users WHERE id = ?",
    [subject.sub],
  );
  if (!user || !user.is_active || user.role !== "admin") return null;
  if ((await passwordFingerprint(user.password_hash)) !== subject.pwd) return null;
  return { id: user.id, username: user.username, client_name: subject.client_name };
}

export const wwwAuthenticate = (request: Request) => `Bearer resource_metadata="${new URL(request.url).origin}/.well-known/oauth-protected-resource"`;

export const requireMcpCaller: MiddlewareHandler<McpEnv> = async (c, next) => {
  const token = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const claims = token ? await readToken(c.env.SESSION_SECRET, token, "access") : null;
  const caller = claims && claims.aud === new URL(c.req.url).origin ? await liveAdmin(c.env, claims) : null;
  if (!caller) {
    return c.json({ detail: token ? "Invalid or expired token, or the account is no longer an active admin" : "Missing bearer token" }, 401, {
      "WWW-Authenticate": wwwAuthenticate(c.req.raw),
    });
  }
  c.set("caller", caller);
  await next();
};

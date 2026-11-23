// Minimal OAuth 2.1 (PKCE, dynamic registration) for MCP clients; admins sign in with their dashboard login.
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { checkCredentials } from "../auth/login";
import type { WorkerEnv } from "../env";
import { ApiError } from "../http";
import { liveAdmin, passwordFingerprintOf } from "./caller";
import { loginPage } from "./login-page";
import { ACCESS_TTL_S, CODE_TTL_S, issueToken, pkceChallenge, readToken, REFRESH_TTL_S, type Subject, type TokenClaims } from "./tokens";

// Codes go only to Claude's connector callbacks or loopback; any other URI could hand a code to a third party.
const REDIRECT_ALLOWLIST = new Set(["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"]);

function isAllowedRedirect(uri: string): boolean {
  if (REDIRECT_ALLOWLIST.has(uri)) return true;
  try {
    const url = new URL(uri);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

type Ctx = Context<WorkerEnv>;
type Params = Record<string, string | undefined>;

function oauthError(c: Ctx, error: string, description: string) {
  return c.json({ error, error_description: description }, 400, { "Cache-Control": "no-store" });
}

async function tokenPair(c: Ctx, subject: Subject) {
  const secret = c.env.SESSION_SECRET;
  const origin = new URL(c.req.url).origin;
  return c.json(
    {
      access_token: await issueToken(secret, "access", { ...subject, aud: origin }, ACCESS_TTL_S),
      token_type: "Bearer",
      expires_in: ACCESS_TTL_S,
      refresh_token: await issueToken(secret, "refresh", subject, REFRESH_TTL_S),
    },
    200,
    { "Cache-Control": "no-store" },
  );
}

type Authorize = Omit<TokenClaims<"code">, "sub" | "pwd"> & { state: string };

async function readAuthorize(secret: string, params: Params): Promise<Authorize> {
  if (params.response_type !== "code") throw new HTTPException(400, { message: "response_type must be code" });
  if (params.code_challenge_method !== "S256" || !params.code_challenge) throw new HTTPException(400, { message: "PKCE with S256 is required" });
  const clientId = params.client_id;
  const client = clientId ? await readToken(secret, clientId, "client") : null;
  if (!clientId || !client) throw new HTTPException(400, { message: "Unknown client. Remove the connector and add it again." });
  const redirectUri = params.redirect_uri ?? "";
  if (!client.redirect_uris.includes(redirectUri) || !isAllowedRedirect(redirectUri)) throw new HTTPException(400, { message: "redirect_uri is not allowed" });
  return { client_id: clientId, client_name: client.client_name, redirect_uri: redirectUri, code_challenge: params.code_challenge, state: params.state ?? "" };
}

async function formParams(c: Ctx): Promise<Params> {
  const body = await c.req.parseBody();
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, typeof value === "string" ? value : undefined]));
}

// RFC 7591 client metadata; only the name and redirect URIs matter here.
const registration = z.object({
  client_name: z.string().trim().catch("").transform((name) => name.slice(0, 100) || "MCP client"),
  redirect_uris: z.array(z.string()).min(1).refine((uris) => uris.every(isAllowedRedirect)),
});

function protectedResource(c: Ctx) {
  const origin = new URL(c.req.url).origin;
  return c.json({ resource: `${origin}/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"], resource_name: "Best Builders CRM" });
}

export const oauthRoutes = new Hono<WorkerEnv>()
  // RFC 9728: tells MCP clients which authorization server protects /mcp.
  .get("/.well-known/oauth-protected-resource/*", (c) => protectedResource(c))
  .get("/.well-known/oauth-protected-resource", (c) => protectedResource(c))
  .get("/.well-known/oauth-authorization-server", (c) => {
    const origin = new URL(c.req.url).origin;
    return c.json({
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  })
  // The client ID is a signed record of its name and redirect URIs, so nothing is stored.
  .post("/register", async (c) => {
    const body = registration.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return oauthError(c, "invalid_redirect_uri", "Only Claude connector and loopback redirect URIs are allowed");
    const { client_name, redirect_uris } = body.data;
    const clientId = await issueToken(c.env.SESSION_SECRET, "client", { client_name, redirect_uris });
    return c.json(
      {
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name,
        redirect_uris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201,
    );
  })
  .get("/authorize", async (c) => {
    const params = c.req.query();
    const checked = await readAuthorize(c.env.SESSION_SECRET, params);
    return loginPage(c, params, checked.client_name);
  })
  .post("/authorize", async (c) => {
    const secret = c.env.SESSION_SECRET;
    const form = await formParams(c);
    const { state, ...request } = await readAuthorize(secret, form);
    const { password, ...shown } = form;
    let user;
    try {
      user = await checkCredentials(c.env, form.username ?? "", password ?? "");
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      return loginPage(c, shown, request.client_name, { message: error.message, status: error.status === 429 ? 429 : 401 });
    }
    if (user.role !== "admin") {
      console.warn("[mcp:audit]", JSON.stringify({ op: "oauth_connect", caller: user.username, client: request.client_name, ok: false, error: "not admin" }));
      return loginPage(c, shown, request.client_name, { message: "Only admins can connect AI apps to the dashboard.", status: 403 });
    }

    const pwd = (await passwordFingerprintOf(c.env, user.id))!;
    const code = await issueToken(secret, "code", { ...request, sub: user.id, pwd }, CODE_TTL_S);
    const target = new URL(request.redirect_uri);
    target.searchParams.set("code", code);
    if (state) target.searchParams.set("state", state);
    console.log("[mcp:audit]", JSON.stringify({ op: "oauth_connect", caller: user.username, client: request.client_name, ok: true }));
    return c.redirect(target.toString(), 302);
  })
  .post("/token", async (c) => {
    const secret = c.env.SESSION_SECRET;
    const form = await formParams(c);

    if (form.grant_type === "authorization_code") {
      const code = form.code ? await readToken(secret, form.code, "code") : null;
      if (!code) return oauthError(c, "invalid_grant", "Code is invalid or expired");
      if (form.client_id && form.client_id !== code.client_id) return oauthError(c, "invalid_grant", "Code was issued to another client");
      if (form.redirect_uri !== code.redirect_uri) return oauthError(c, "invalid_grant", "redirect_uri does not match");
      if (!form.code_verifier || (await pkceChallenge(form.code_verifier)) !== code.code_challenge) return oauthError(c, "invalid_grant", "PKCE verification failed");
      const { client_id, client_name, sub, pwd } = code;
      return tokenPair(c, { client_id, client_name, sub, pwd });
    }

    if (form.grant_type === "refresh_token") {
      const refresh = form.refresh_token ? await readToken(secret, form.refresh_token, "refresh") : null;
      // A refresh re-checks the account, so a demoted or deactivated admin can't keep a connector alive.
      if (!refresh || !(await liveAdmin(c.env, refresh))) return oauthError(c, "invalid_grant", "Refresh token is invalid or expired, or the account is no longer an active admin");
      return tokenPair(c, refresh);
    }

    return oauthError(c, "unsupported_grant_type", "Use authorization_code or refresh_token");
  });

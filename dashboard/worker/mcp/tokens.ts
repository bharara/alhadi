// Client IDs, codes and tokens are JWTs keyed off SESSION_SECRET; rotating it revokes every connector.
import { sign, verify } from "hono/jwt";
import { z } from "zod";

export const CODE_TTL_S = 5 * 60;
export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_S = 30 * 24 * 60 * 60;

// Who the token acts as. `pwd` fingerprints the password hash, so changing the password revokes the token.
const subject = { client_id: z.string(), client_name: z.string(), sub: z.string(), pwd: z.string() };

const client = z.object({ client_name: z.string(), redirect_uris: z.array(z.string()) });
// An authorization code, bound to the client, its redirect and its PKCE challenge.
const code = z.object({ ...subject, redirect_uri: z.string(), code_challenge: z.string() });
// Good for one origin's /mcp.
const access = z.object({ ...subject, aud: z.string() });
const refresh = z.object(subject);

type Tokens = {
  client: z.output<typeof client>;
  code: z.output<typeof code>;
  access: z.output<typeof access>;
  refresh: z.output<typeof refresh>;
};
type TokenType = keyof Tokens;
export type TokenClaims<T extends TokenType> = Tokens[T];
export type Subject = z.output<typeof refresh>;
const TOKENS: { [T in TokenType]: z.ZodType<Tokens[T]> } = { client, code, access, refresh };

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

const signingKey = (secret: string) => sha256(`bbd-mcp-oauth\0${secret}`);

export const passwordFingerprint = async (passwordHash: string) => (await sha256(`bbd-mcp-pwd\0${passwordHash}`)).slice(0, 16);

export async function issueToken<T extends TokenType>(secret: string, typ: T, claims: TokenClaims<T>, ttlSeconds?: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ ...claims, typ, iat: now, ...(ttlSeconds ? { exp: now + ttlSeconds } : {}) }, await signingKey(secret), "HS256");
}

export async function readToken<T extends TokenType>(secret: string, token: string, typ: T): Promise<TokenClaims<T> | null> {
  let payload: unknown;
  try {
    payload = await verify(token, await signingKey(secret), "HS256");
  } catch {
    return null;
  }
  if (!z.object({ typ: z.literal(typ) }).safeParse(payload).success) return null;
  const parsed = TOKENS[typ].safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

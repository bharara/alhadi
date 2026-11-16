// Google service-account auth (OAuth 2.0 JWT bearer flow) with WebCrypto.
type ServiceAccount = { client_email: string; private_key: string };

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const cache = new Map<string, { token: string; expires: number }>();

export function parseServiceAccount(json: string): ServiceAccount {
  const parsed = JSON.parse(json) as Partial<ServiceAccount>;
  if (!parsed.client_email || !parsed.private_key) throw new Error("GSC_SERVICE_ACCOUNT_JSON needs client_email and private_key");
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

export async function googleAccessToken(account: ServiceAccount, scopes: string[]): Promise<string> {
  const cacheKey = `${account.client_email} ${scopes.join(" ")}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iss: account.client_email, scope: scopes.join(" "), aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${base64url(new Uint8Array(signature))}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Google token request failed (${response.status}): ${await response.text()}`);
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cache.set(cacheKey, { token: data.access_token, expires: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0)).buffer;
}

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

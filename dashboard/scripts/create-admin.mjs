// Creates (or resets) an admin user. Same hash format as worker/auth/password.ts.
//   Local:  node scripts/create-admin.mjs <username>            (pepper from .dev.vars)
//   Remote: PASSWORD_PEPPER=... node scripts/create-admin.mjs <username> --remote
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
import { createInterface } from "node:readline/promises";

const [username, flag] = process.argv.slice(2);
const remote = flag === "--remote";
if (!username) {
  console.error("Usage: node scripts/create-admin.mjs <username> [--remote]");
  process.exit(1);
}

const pepper = process.env.PASSWORD_PEPPER ?? (!remote ? readDevVar("PASSWORD_PEPPER") : undefined);
if (!pepper) {
  console.error("Set PASSWORD_PEPPER to the same value as the Worker secret.");
  process.exit(1);
}

const password = process.env.ADMIN_PASSWORD ?? (await ask("Password (min 8 chars): "));
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const hash = await hashPassword(password, pepper);
const now = new Date().toISOString();
const name = username.trim().toLowerCase();
const sql =
  `INSERT INTO users (id, username, password_hash, is_active, role, created_at) VALUES ('${crypto.randomUUID()}', '${name.replace(/'/g, "''")}', '${hash}', 1, 'admin', '${now}') ` +
  `ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash, is_active = 1, role = 'admin', updated_at = '${now}';`;

const wrangler = ["exec", "wrangler", "d1", "execute", "DB", remote ? "--remote" : "--local", "--command", sql];
if (remote) execFileSync("bash", ["scripts/cf.sh", "pnpm", ...wrangler], { stdio: "inherit" });
else execFileSync("pnpm", wrangler, { stdio: "inherit" });
console.log(`Admin "${name}" is ready (${remote ? "remote" : "local"}).`);

async function hashPassword(password, pepper) {
  const enc = new TextEncoder();
  const iterations = 10_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hmacKey = await crypto.subtle.importKey("raw", enc.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const peppered = await crypto.subtle.sign("HMAC", hmacKey, enc.encode(password));
  const key = await crypto.subtle.importKey("raw", peppered, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  const b64 = (bytes) => Buffer.from(bytes).toString("base64");
  return `pbkdf2_sha256$${iterations}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

function readDevVar(name) {
  try {
    const line = readFileSync(".dev.vars", "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).replace(/^"|"$/g, "");
  } catch {
    return undefined;
  }
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

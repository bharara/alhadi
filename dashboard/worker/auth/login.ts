import { first, nowIso, run } from "../db";
import type { Env } from "../env";
import { ApiError } from "../http";
import { verifyPassword } from "./password";

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

export type LoginUser = { id: string; username: string; role: "admin" | "member"; password_hash: string };

/** Checks a username and password with the dashboard's lockout; shared by the dashboard login and the MCP connector login. */
export async function checkCredentials(env: Env, rawUsername: string, password: string): Promise<LoginUser> {
  const username = rawUsername.trim().toLowerCase();
  const db = env.DB;
  const since = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();
  const failures = await first<{ n: number }>(db, "SELECT COUNT(*) AS n FROM login_failures WHERE username = ? AND attempted_at >= ?", [username, since]);
  if ((failures?.n ?? 0) >= MAX_FAILURES) throw new ApiError(429, "Too many attempts. Try again in 15 minutes.");

  const user = await first<LoginUser & { is_active: number }>(db, "SELECT id, username, role, password_hash, is_active FROM users WHERE username = ?", [username]);
  if (!user || !user.is_active || !(await verifyPassword(password, user.password_hash, env.PASSWORD_PEPPER))) {
    await db.batch([
      db.prepare("INSERT INTO login_failures (username, attempted_at) VALUES (?, ?)").bind(username, nowIso()),
      db.prepare("DELETE FROM login_failures WHERE attempted_at < ?").bind(since),
    ]);
    throw new ApiError(401, "Invalid username or password");
  }
  await run(db, "DELETE FROM login_failures WHERE username = ?", [username]);
  return { id: user.id, username: user.username, role: user.role, password_hash: user.password_hash };
}

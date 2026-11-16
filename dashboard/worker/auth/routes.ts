import { Hono } from "hono";
import { z } from "zod";
import { first, newId, nowIso, run, type Db } from "../db";
import type { AuthedEnv, WorkerEnv } from "../env";
import { ApiError } from "../http";
import { zJson, zQuery } from "../validation";
import { requireUser } from "./middleware";
import { hashPassword, verifyPassword } from "./password";
import { endSession, startSession } from "./session";

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

type Invite = { id: string; email: string; role: "admin" | "member"; expires_at: string; consumed_at: string | null };

export const authRoutes = new Hono<WorkerEnv>()
  .post("/login", zJson(z.object({ username: z.string().min(1).max(255), password: z.string().min(1).max(255) })), async (c) => {
    const { password } = c.req.valid("json");
    const username = c.req.valid("json").username.trim().toLowerCase();
    const db = c.env.DB;
    const since = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();
    const failures = await first<{ n: number }>(db, "SELECT COUNT(*) AS n FROM login_failures WHERE username = ? AND attempted_at >= ?", [username, since]);
    if ((failures?.n ?? 0) >= MAX_FAILURES) throw new ApiError(429, "Too many attempts. Try again in 15 minutes.");

    const user = await first<{ id: string; password_hash: string; is_active: number }>(
      db,
      "SELECT id, password_hash, is_active FROM users WHERE username = ?",
      [username],
    );
    if (!user || !user.is_active || !(await verifyPassword(password, user.password_hash, c.env.PASSWORD_PEPPER))) {
      await db.batch([
        db.prepare("INSERT INTO login_failures (username, attempted_at) VALUES (?, ?)").bind(username, nowIso()),
        db.prepare("DELETE FROM login_failures WHERE attempted_at < ?").bind(since),
      ]);
      throw new ApiError(401, "Invalid username or password");
    }
    await run(db, "DELETE FROM login_failures WHERE username = ?", [username]);
    await startSession(c, user.id, c.env.SESSION_SECRET);
    return c.json({ ok: true });
  })
  .post("/logout", (c) => {
    endSession(c);
    return c.json({ ok: true });
  })
  .get("/invite", zQuery(z.object({ token: z.string().min(1) })), async (c) => {
    const invite = await openInvite(c.env.DB, c.req.valid("query").token);
    return c.json({ email: invite.email, expires_at: invite.expires_at });
  })
  .post("/invite/accept", zJson(z.object({ token: z.string().min(1), password: z.string().min(8).max(255) })), async (c) => {
    const { token, password } = c.req.valid("json");
    const db = c.env.DB;
    const invite = await openInvite(db, token);
    if (await first(db, "SELECT id FROM users WHERE username = ?", [invite.email])) throw new ApiError(409, "A user with this email already exists");
    const id = newId();
    const now = nowIso();
    await db.batch([
      db
        .prepare("INSERT INTO users (id, username, password_hash, is_active, role, created_at) VALUES (?, ?, ?, 1, ?, ?)")
        .bind(id, invite.email, await hashPassword(password, c.env.PASSWORD_PEPPER), invite.role, now),
      db.prepare("UPDATE user_invites SET consumed_at = ?, updated_at = ? WHERE id = ?").bind(now, now, invite.id),
    ]);
    await startSession(c, id, c.env.SESSION_SECRET);
    return c.json({ ok: true });
  });

export const meRoutes = new Hono<AuthedEnv>().use(requireUser).get("/", (c) => c.json({ user: c.get("user") }));

async function openInvite(db: Db, token: string): Promise<Invite> {
  const invite = await first<Invite>(db, "SELECT id, email, role, expires_at, consumed_at FROM user_invites WHERE token = ?", [token]);
  if (!invite || invite.consumed_at) throw new ApiError(400, "This invitation is no longer valid");
  if (invite.expires_at <= nowIso()) throw new ApiError(400, "This invitation has expired");
  return invite;
}

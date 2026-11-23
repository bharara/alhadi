import { Hono } from "hono";
import { z } from "zod";
import { first, newId, nowIso, type Db } from "../db";
import type { AuthedEnv, WorkerEnv } from "../env";
import { ApiError } from "../http";
import { zJson, zQuery } from "../validation";
import { requireUser } from "./middleware";
import { openPasswordLink } from "./password-links";
import { checkCredentials } from "./login";
import { hashPassword } from "./password";
import { endSession, startSession } from "./session";

type Invite = { id: string; email: string; role: "admin" | "member"; expires_at: string; consumed_at: string | null };

export const authRoutes = new Hono<WorkerEnv>()
  .post("/login", zJson(z.object({ username: z.string().min(1).max(255), password: z.string().min(1).max(255) })), async (c) => {
    const { username, password } = c.req.valid("json");
    const user = await checkCredentials(c.env, username, password);
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

export const passwordLinkRoutes = new Hono<WorkerEnv>()
  .get("/", zQuery(z.object({ token: z.string().min(1) })), async (c) => {
    const link = await openPasswordLink(c.env.DB, c.req.valid("query").token);
    return c.json({ username: link.username, expires_at: link.expires_at });
  })
  .post("/accept", zJson(z.object({ token: z.string().min(1), password: z.string().min(8).max(255) })), async (c) => {
    const { token, password } = c.req.valid("json");
    const db = c.env.DB;
    const link = await openPasswordLink(db, token);
    const now = nowIso();
    await db.batch([
      db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(password, c.env.PASSWORD_PEPPER), now, link.user_id),
      db.prepare("UPDATE password_links SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL").bind(now, link.user_id),
    ]);
    await startSession(c, link.user_id, c.env.SESSION_SECRET);
    return c.json({ ok: true });
  });

export const meRoutes = new Hono<AuthedEnv>().use(requireUser).get("/", (c) => c.json({ user: c.get("user") }));

async function openInvite(db: Db, token: string): Promise<Invite> {
  const invite = await first<Invite>(db, "SELECT id, email, role, expires_at, consumed_at FROM user_invites WHERE token = ?", [token]);
  if (!invite || invite.consumed_at) throw new ApiError(400, "This invitation is no longer valid");
  if (invite.expires_at <= nowIso()) throw new ApiError(400, "This invitation has expired");
  return invite;
}

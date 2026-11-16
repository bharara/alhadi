import { Hono } from "hono";
import { z } from "zod";
import { requireAdmin } from "../auth/middleware";
import { hashPassword, randomToken } from "../auth/password";
import { createPasswordLink } from "../auth/password-links";
import { all, first, newId, nowIso, run, type Db } from "../db";
import type { AuthedEnv } from "../env";
import { ApiError } from "../http";
import { idParam, zJson, zParam } from "../validation";

const ROLES = ["admin", "member"] as const;
const INVITE_DAYS = 7;

type ManagedUser = { id: string; username: string; is_active: boolean; role: (typeof ROLES)[number] };
type UserRow = Omit<ManagedUser, "is_active"> & { is_active: number };
type InviteRow = { id: string; email: string; expires_at: string; role: (typeof ROLES)[number]; token: string };

const withUrl = (appUrl: string, { token, ...invite }: InviteRow) => ({ ...invite, invite_url: `${appUrl}/accept-invite?token=${token}` });

const toUser = (row: UserRow): ManagedUser => ({ ...row, is_active: Boolean(row.is_active) });

/** Active users for pickers (assignees, task owners). Any signed-in user can read this. */
export const crmUserRoutes = new Hono<AuthedEnv>().get("/", async (c) =>
  c.json(await all<{ id: string; username: string }>(c.env.DB, "SELECT id, username FROM users WHERE is_active = 1 ORDER BY username")),
);

export const userManagementRoutes = new Hono<AuthedEnv>()
  .use(requireAdmin)
  .get("/users", async (c) => c.json((await all<UserRow>(c.env.DB, "SELECT id, username, is_active, role FROM users ORDER BY username")).map(toUser)))
  .put("/users/:id/role", zParam(idParam), zJson(z.object({ role: z.enum(ROLES) })), async (c) => {
    const db = c.env.DB;
    const target = await loadUser(db, c.req.valid("param").id);
    const { role } = c.req.valid("json");
    if (target.id === c.get("user").id && role !== "admin") throw new ApiError(400, "Cannot remove your own admin access");
    if (target.role === role) throw new ApiError(400, "User already has that role");
    if (target.role === "admin" && target.is_active) await assertAnotherActiveAdmin(db);
    await run(db, "UPDATE users SET role = ?, updated_at = ? WHERE id = ?", [role, nowIso(), target.id]);
    return c.json(toUser({ ...target, role }));
  })
  .put("/users/:id/password", zParam(idParam), zJson(z.object({ password: z.string().min(8).max(255) })), async (c) => {
    const target = await loadUser(c.env.DB, c.req.valid("param").id);
    if (!target.is_active) throw new ApiError(400, "Cannot set a password for an inactive user");
    const hash = await hashPassword(c.req.valid("json").password, c.env.PASSWORD_PEPPER);
    await run(c.env.DB, "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [hash, nowIso(), target.id]);
    return c.json({ ok: true });
  })
  .post("/users/:id/password-link", zParam(idParam), async (c) => {
    const target = await loadUser(c.env.DB, c.req.valid("param").id);
    if (!target.is_active) throw new ApiError(400, "Activate this user before sending a password link");
    return c.json(await createPasswordLink(c.env.DB, target.id, c.env.APP_URL), 201);
  })
  .post("/users/:id/active", zParam(idParam), zJson(z.object({ is_active: z.boolean() })), async (c) => {
    const db = c.env.DB;
    const target = await loadUser(db, c.req.valid("param").id);
    const active = c.req.valid("json").is_active;
    if (!active && target.id === c.get("user").id) throw new ApiError(400, "Cannot deactivate yourself");
    if (Boolean(target.is_active) === active) throw new ApiError(400, `User is already ${active ? "active" : "inactive"}`);
    if (!active && target.role === "admin") await assertAnotherActiveAdmin(db);
    await run(db, "UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?", [active ? 1 : 0, nowIso(), target.id]);
    return c.json(toUser({ ...target, is_active: active ? 1 : 0 }));
  })
  .get("/invites", async (c) =>
    c.json(
      (
        await all<InviteRow>(c.env.DB, "SELECT id, email, expires_at, role, token FROM user_invites WHERE consumed_at IS NULL AND expires_at > ? ORDER BY created_at, id", [
          nowIso(),
        ])
      ).map((invite) => withUrl(c.env.APP_URL, invite)),
    ),
  )
  .post("/invites", zJson(z.object({ email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")), role: z.enum(ROLES).default("member") })), async (c) => {
    const db = c.env.DB;
    const { email } = c.req.valid("json");
    if (await first(db, "SELECT id FROM users WHERE username = ?", [email])) throw new ApiError(409, "A user with this email already exists");
    const now = nowIso();
    const invite: InviteRow = {
      id: newId(),
      email,
      role: c.req.valid("json").role,
      expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
      token: randomToken(),
    };
    await db.batch([
      db.prepare("UPDATE user_invites SET consumed_at = ?, updated_at = ? WHERE email = ? AND consumed_at IS NULL").bind(now, now, email),
      db
        .prepare("INSERT INTO user_invites (id, email, token, expires_at, role, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(invite.id, email, invite.token, invite.expires_at, invite.role, now),
    ]);
    return c.json(withUrl(c.env.APP_URL, invite), 201);
  })
  .delete("/invites/:id", zParam(idParam), async (c) => {
    const now = nowIso();
    const changed = await run(c.env.DB, "UPDATE user_invites SET consumed_at = ?, updated_at = ? WHERE id = ? AND consumed_at IS NULL", [
      now,
      now,
      c.req.valid("param").id,
    ]);
    if (!changed) throw new ApiError(404, "Invitation not found");
    return c.json({ ok: true });
  });

async function loadUser(db: Db, id: string): Promise<UserRow> {
  const user = await first<UserRow>(db, "SELECT id, username, is_active, role FROM users WHERE id = ?", [id]);
  if (!user) throw new ApiError(404, "User not found");
  return user;
}

async function assertAnotherActiveAdmin(db: Db): Promise<void> {
  const admins = await first<{ n: number }>(db, "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1");
  if ((admins?.n ?? 0) <= 1) throw new ApiError(400, "Cannot remove the last active admin");
}

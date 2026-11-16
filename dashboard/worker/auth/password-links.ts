import { first, newId, nowIso, type Db } from "../db";
import { ApiError } from "../http";
import { randomToken } from "./password";

const LINK_DAYS = 7;

type OpenLink = { id: string; user_id: string; username: string; expires_at: string };

const passwordLinkUrl = (appUrl: string, token: string) => `${appUrl}/set-password?token=${token}`;

/** Issues a new link for an active user, replacing any open one. */
export async function createPasswordLink(db: Db, userId: string, appUrl: string): Promise<{ url: string; expires_at: string }> {
  const token = randomToken();
  const now = nowIso();
  const expires_at = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
  await db.batch([
    db.prepare("UPDATE password_links SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL").bind(now, userId),
    db.prepare("INSERT INTO password_links (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").bind(newId(), userId, token, expires_at, now),
  ]);
  return { url: passwordLinkUrl(appUrl, token), expires_at };
}

export async function openPasswordLink(db: Db, token: string): Promise<OpenLink> {
  const link = await first<OpenLink & { consumed_at: string | null; is_active: number }>(
    db,
    `SELECT l.id, l.user_id, u.username, l.expires_at, l.consumed_at, u.is_active
     FROM password_links l JOIN users u ON u.id = l.user_id WHERE l.token = ?`,
    [token],
  );
  if (!link || link.consumed_at || !link.is_active) throw new ApiError(400, "This link is no longer valid. Ask an admin for a new one.");
  if (link.expires_at <= nowIso()) throw new ApiError(400, "This link has expired. Ask an admin for a new one.");
  return link;
}

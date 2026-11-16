import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { first, type Db } from "../db";
import type { SessionUser } from "../env";

const COOKIE = "bbd_session";
const MAX_AGE = 14 * 24 * 60 * 60;

export async function startSession(c: Context, userId: string, secret: string): Promise<void> {
  const token = await sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE }, secret, "HS256");
  setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: MAX_AGE });
}

export function endSession(c: Context): void {
  deleteCookie(c, COOKIE, { path: "/", secure: true });
}

/** The signed-in, still-active user, or null. */
export async function sessionUser(c: Context, db: Db, secret: string): Promise<SessionUser | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  let sub: unknown;
  try {
    sub = (await verify(token, secret, "HS256")).sub;
  } catch {
    return null;
  }
  if (typeof sub !== "string") return null;
  return first<SessionUser>(db, "SELECT id, username, role FROM users WHERE id = ? AND is_active = 1", [sub]);
}

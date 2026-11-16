import type { MiddlewareHandler } from "hono";
import type { AuthedEnv } from "../env";
import { ApiError } from "../http";
import { endSession, sessionUser } from "./session";

export const requireUser: MiddlewareHandler<AuthedEnv> = async (c, next) => {
  const user = await sessionUser(c, c.env.DB, c.env.SESSION_SECRET);
  if (!user) {
    endSession(c);
    throw new ApiError(401, "Not authenticated");
  }
  c.set("user", user);
  await next();
  c.header("Cache-Control", "private, no-store");
};

export const requireAdmin: MiddlewareHandler<AuthedEnv> = async (c, next) => {
  if (c.get("user").role !== "admin") throw new ApiError(403, "Admin access required");
  await next();
};

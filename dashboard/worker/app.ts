import { Hono } from "hono";
import { analyticsRoutes } from "./analytics/routes";
import { articleRoutes } from "./articles/routes";
import { requireUser } from "./auth/middleware";
import { authRoutes, meRoutes, passwordLinkRoutes } from "./auth/routes";
import type { AuthedEnv, WorkerEnv } from "./env";
import { errorHandler } from "./http";
import { inventoryRoutes } from "./inventory/routes";
import { prospectRoutes } from "./prospects/routes";
import { reportRoutes } from "./report/routes";
import { collectRoutes } from "./site-analytics/collect";
import { siteAnalyticsRoutes } from "./site-analytics/routes";
import { crmUserRoutes, userManagementRoutes } from "./users/routes";
import { publicRoutes } from "./website/public";
import { websiteRoutes } from "./website/routes";

const crm = new Hono<AuthedEnv>()
  .use(requireUser)
  .route("/users", crmUserRoutes)
  .route("/prospects", prospectRoutes)
  .route("/dashboard", reportRoutes)
  .route("/inventory", inventoryRoutes)
  .route("/website", websiteRoutes)
  .route("/articles", articleRoutes)
  .route("/analytics", analyticsRoutes)
  .route("/site-analytics", siteAnalyticsRoutes)
  .route("/user-management", userManagementRoutes);

export const app = new Hono<WorkerEnv>()
  .onError(errorHandler())
  .get("/api/health", (c) => c.json({ status: "ok" }))
  .route("/api/public", publicRoutes)
  // Site analytics events, sent same-origin from bestbuilderdeveloper.com/a/e.
  .route("/a", collectRoutes)
  .route("/api/auth", authRoutes)
  .route("/api/auth/password-link", passwordLinkRoutes)
  .route("/api/me", meRoutes)
  .route("/api/crm", crm)
  .notFound((c) => c.json({ detail: "Not found" }, 404));

export type AppType = typeof app;

import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** An error whose message is meant for the person using the dashboard. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorHandler(): ErrorHandler {
  return (error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    if (error instanceof ApiError) return c.json({ detail: error.message }, error.status as ContentfulStatusCode);
    console.error(`[api] ${c.req.method} ${c.req.path} failed: ${error instanceof Error ? error.message : String(error)}`, error);
    return c.json({ detail: "Something went wrong. Please try again." }, 500);
  };
}

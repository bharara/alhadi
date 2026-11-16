import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ApiError } from "./http";

function detailFromError(error: { issues?: { message?: string; path?: PropertyKey[] }[]; message?: string }): string {
  const issue = error.issues?.[0];
  if (!issue) return error.message || "Invalid request";
  const field = issue.path?.length ? `${issue.path.map(String).join(".")}: ` : "";
  return `${field}${issue.message}`;
}

// Hono validators that answer a bad request with 422 and the first issue, in the { detail } shape.
function validated<T extends "json" | "query" | "param">(target: T) {
  return <S extends z.ZodType>(schema: S) =>
    zValidator(target, schema, (result) => {
      if (!result.success) throw new ApiError(422, detailFromError(result.error));
    });
}

export const zJson = validated("json");
export const zQuery = validated("query");
export const zParam = validated("param");

export const idParam = z.object({ id: z.string().min(1).max(64) });

/** ISO 8601 instant with an offset, stored as UTC ISO text. */
export const isoInstant = z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString());

export const isoDate = z.iso.date();

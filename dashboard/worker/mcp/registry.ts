import { z } from "zod";
import type { Env } from "../env";
import { ApiError } from "../http";
import type { Caller } from "./caller";

export type ToolContext = { env: Env; caller: Caller };

type ToolDefinition<Input extends z.ZodObject> = {
  name: string;
  title: string;
  description: string;
  input: Input;
  // Every tool reads or adds. Nothing here updates or deletes existing records.
  access: "read" | "write";
  run: (ctx: ToolContext, input: z.output<Input>) => Promise<unknown>;
};

export type Tool = {
  name: string;
  title: string;
  description: string;
  access: "read" | "write";
  input: z.ZodObject;
  /** Validates raw MCP arguments, runs the tool and writes an audit line. */
  call: (ctx: ToolContext, rawInput: unknown) => Promise<unknown>;
};

export function defineTool<Input extends z.ZodObject>(definition: ToolDefinition<Input>): Tool {
  const { name, title, description, input, access } = definition;
  return {
    name,
    title,
    description,
    access,
    input,
    async call(ctx, rawInput) {
      const parsed = input.safeParse(rawInput ?? {});
      if (!parsed.success) throw new ApiError(422, parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
      const started = Date.now();
      // Queryable in Workers observability: who ran what, from which app.
      const audit = { tool: name, access, caller: ctx.caller.username, client: ctx.caller.client_name, input: access === "write" ? summarize(parsed.data) : parsed.data };
      try {
        const result = await definition.run(ctx, parsed.data);
        console.log("[mcp:audit]", JSON.stringify({ ...audit, ok: true, ms: Date.now() - started }));
        return result;
      } catch (error) {
        console.log("[mcp:audit]", JSON.stringify({ ...audit, ok: false, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }));
        throw error;
      }
    },
  };
}

// Long fields (an article body) are logged by length, not content.
function summarize(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === "string" && v.length > 300 ? `<${v.length} chars>` : v]));
}

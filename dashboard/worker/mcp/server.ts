import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ApiError } from "../http";
import type { ToolContext } from "./registry";
import { tools, toolsByName } from "./tools";

const INSTRUCTIONS =
  "The Best Builders & Developers CRM and website (bestbuilderdeveloper.com), a property dealer and developer in Faisalabad, Pakistan. Leads are prospects; properties are inventory_items; articles are published at /articles/. Read with the read tools or query_sql; add leads and articles with add_prospect and create_article. You act as the signed-in admin and every call is audited. There are no update or delete tools: send people to the dashboard (crm.bestbuilderdeveloper.com) for those.";

// The low-level server, so arguments reach tool.call() unparsed and are validated once.
function createServer(ctx: ToolContext) {
  const server = new Server({ name: "best-builders-crm", version: "0.1.0" }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: { ...z.toJSONSchema(tool.input, { target: "draft-7", io: "input" }), type: "object" as const },
      annotations: { title: tool.title, readOnlyHint: tool.access === "read", destructiveHint: false, idempotentHint: tool.access === "read", openWorldHint: false },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolsByName.get(request.params.name);
    try {
      if (!tool) throw new ApiError(404, `Unknown tool ${request.params.name}`);
      const data = await tool.call(ctx, request.params.arguments);
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    } catch (error) {
      if (!(error instanceof ApiError)) console.error(`[mcp] ${request.params.name} failed`, error);
      const message = error instanceof ApiError ? `${error.status}: ${error.message}` : "Internal error";
      return { isError: true, content: [{ type: "text" as const, text: message }] };
    }
  });
  return server;
}

// Stateless Streamable HTTP: one server per request, JSON responses, no SSE session.
export async function handleMcpRequest(request: Request, ctx: ToolContext): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const server = createServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return new Response(await response.arrayBuffer(), { status: response.status, headers: { ...Object.fromEntries(response.headers), "Cache-Control": "no-store" } });
  } finally {
    await server.close();
  }
}

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcpRequest } from "@/lib/mcp/session";
import { createMcpServer } from "@/lib/mcp/server";
import { mcpErrorResponse } from "@/lib/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  try {
    const { sessionHash } = await authenticateMcpRequest(request);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 1_000_000,
    });
    const server = createMcpServer(sessionHash);
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export { handle as GET, handle as POST, handle as DELETE };

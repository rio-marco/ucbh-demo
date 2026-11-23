import {
  generateState,
  getQBConfig,
  getRedirectUri,
  INTUIT_AUTH_URL,
  QB_SCOPES,
  sanitizeReturnTo,
} from "@/lib/quickbooks";
import { assertMcpSecretsConfigured, McpError } from "@/lib/mcp/config";
import { getPrimaryConnection } from "@/lib/mcp/db";
import { mcpErrorResponse, mcpJson } from "@/lib/mcp/http";
import { resolveBrowserSession } from "@/lib/mcp/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertMcpSecretsConfigured();

    const session = await resolveBrowserSession(request);
    const connection = await getPrimaryConnection(session.hash);
    if (connection?.is_connected) {
      return mcpJson({ connected: true }, 200, session);
    }

    const { clientId, clientSecret } = getQBConfig();
    if (!clientId || !clientSecret || clientId === "your_client_id_here") {
      throw new McpError("config_error");
    }

    const url = new URL(request.url);
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
    const state = await generateState(returnTo, session.hash);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getRedirectUri(request),
      response_type: "code",
      scope: QB_SCOPES,
      state,
    });

    return mcpJson(
      { authUrl: `${INTUIT_AUTH_URL}?${params.toString()}` },
      200,
      session,
    );
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

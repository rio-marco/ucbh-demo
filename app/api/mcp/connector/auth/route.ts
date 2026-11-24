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
import { getCompanyName } from "@/lib/mcp/quickbooks";
import { mcpErrorResponse, mcpJson } from "@/lib/mcp/http";
import {
  resolveBrowserSession,
  type BrowserSession,
} from "@/lib/mcp/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let session: BrowserSession | null = null;
  try {
    assertMcpSecretsConfigured();

    session = await resolveBrowserSession(request);
    const connection = await getPrimaryConnection(session.hash);
    if (connection?.is_connected) {
      try {
        await getCompanyName(session.hash, connection);
        return mcpJson({ connected: true }, 200, session);
      } catch {
        // The tokens are stale; fall through and let the user reconnect.
      }
    }

    const { clientId, clientSecret } = getQBConfig();
    if (!clientId || !clientSecret || clientId === "your_client_id_here") {
      throw new McpError("config_error");
    }

    const redirectUri = getRedirectUri(request);
    const url = new URL(request.url);
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
    const state = await generateState(returnTo, session.hash, redirectUri);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
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
    return mcpErrorResponse(error, session);
  }
}

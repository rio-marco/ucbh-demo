import {
  generateState,
  getQBConfig,
  getRedirectUri,
  INTUIT_AUTH_URL,
  loadTokens,
  QB_SCOPES,
  sanitizeReturnTo,
} from "@/lib/quickbooks";
import { assertMcpSecretsConfigured, McpError } from "@/lib/mcp/config";
import { mcpErrorResponse, mcpJson } from "@/lib/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertMcpSecretsConfigured();

    const tokens = await loadTokens();
    if (tokens?.access_token && tokens?.refresh_token && tokens?.realm_id) {
      return mcpJson({ connected: true });
    }

    const { clientId, clientSecret } = getQBConfig();
    if (!clientId || !clientSecret || clientId === "your_client_id_here") {
      throw new McpError("config_error");
    }

    const url = new URL(request.url);
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
    const state = await generateState(returnTo);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getRedirectUri(request),
      response_type: "code",
      scope: QB_SCOPES,
      state,
    });

    return mcpJson({ authUrl: `${INTUIT_AUTH_URL}?${params.toString()}` });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

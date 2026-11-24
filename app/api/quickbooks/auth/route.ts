import {
  generateState,
  getQBConfig,
  getRedirectUri,
  INTUIT_AUTH_URL,
  QB_SCOPES,
  sanitizeReturnTo,
} from "@/lib/quickbooks";
import { assertMcpSecretsConfigured } from "@/lib/mcp/config";
import { mcpErrorResponse, mcpJson } from "@/lib/mcp/http";
import { resolveBrowserSession } from "@/lib/mcp/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/quickbooks/auth
 *
 * Starts an Intuit authorization for the current browser session. Each user
 * gets their own state and, after the callback, their own stored connection.
 */
export async function GET(request: Request) {
  const session = await resolveBrowserSession(request);
  const { clientId, clientSecret } = getQBConfig();

  try {
    assertMcpSecretsConfigured();
  } catch {
    return mcpJson(
      {
        error:
          "QuickBooks connection is not configured. Set TOKEN_ENCRYPTION_KEY and MCP_SIGNING_SECRET in .env.",
      },
      503,
      session,
    );
  }

  if (!clientId || !clientSecret || clientId === "your_client_id_here") {
    return mcpJson(
      {
        error:
          "QuickBooks is not configured. Set QB_CLIENT_ID and QB_CLIENT_SECRET in .env.",
      },
      503,
      session,
    );
  }

  let redirectUri: string;
  try {
    redirectUri = getRedirectUri(request);
  } catch (error) {
    return mcpErrorResponse(error, session);
  }

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
}

import { getClaudeSessionCredentials } from "@/lib/claude-session";
import { getClaudeOAuthConfig, revokeClaudeConnection } from "@/lib/claude-oauth";
import { clearClaudeAuth, getClaudeOAuthTokens } from "@/lib/mcp/db";
import { mcpErrorResponse, mcpJson } from "@/lib/mcp/http";
import { resolveBrowserSession } from "@/lib/mcp/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await resolveBrowserSession(request);
    const credentials = await getClaudeSessionCredentials(session.hash);
    const configured = Boolean(getClaudeOAuthConfig());
    return mcpJson(
      {
        connected: Boolean(credentials),
        mode: credentials ? "oauth" : null,
        configured,
        message: credentials
          ? ""
          : configured
            ? "Connect your Claude organization to continue."
            : "Claude login is not configured on this server.",
      },
      200,
      session,
    );
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await resolveBrowserSession(request);
    const tokens = await getClaudeOAuthTokens(session.hash);
    const config = getClaudeOAuthConfig();
    if (tokens?.connectionId && config) {
      await revokeClaudeConnection({
        config,
        connectionId: tokens.connectionId,
      }).catch(() => undefined);
    }
    await clearClaudeAuth(session.hash);
    return mcpJson({ ok: true, connected: false }, 200, session);
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

import { getClaudeOAuthConfig, buildClaudeAuthUrl, createClaudePkce, getClaudeRedirectUri } from "@/lib/claude-oauth";
import { createClaudeOAuthState, getClaudeAuth } from "@/lib/mcp/db";
import { mcpErrorResponse, mcpJson } from "@/lib/mcp/http";
import { resolveBrowserSession } from "@/lib/mcp/session";
import { sanitizeReturnTo } from "@/lib/quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await resolveBrowserSession(request);
    const existing = await getClaudeAuth(session.hash);
    if (existing) {
      return mcpJson(
        {
          connected: true,
          mode: existing.mode,
          profile: {
            id: existing.user_id,
            email: existing.email,
          },
        },
        200,
        session,
      );
    }

    const config = getClaudeOAuthConfig();
    const url = new URL(request.url);
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
    const pkce = createClaudePkce();
    await createClaudeOAuthState({
      stateHash: pkce.stateHash,
      codeVerifier: config.enabled ? pkce.codeVerifier : "demo",
      sessionHash: session.hash,
      returnTo,
      ttlSeconds: 10 * 60,
    });

    if (config.enabled) {
      return mcpJson(
        {
          connected: false,
          mode: "oauth",
          authUrl: buildClaudeAuthUrl({
            config,
            redirectUri: getClaudeRedirectUri(request),
            state: pkce.state,
            codeChallenge: pkce.codeChallenge,
          }),
        },
        200,
        session,
      );
    }

    return mcpJson(
      {
        connected: false,
        mode: "demo",
        authUrl: config.loginUrl,
        state: pkce.state,
      },
      200,
      session,
    );
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

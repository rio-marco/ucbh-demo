import {
  buildClaudeAuthorizeUrl,
  createClaudeOAuthState,
  createClaudeParRequest,
  createClaudePkcePair,
  getClaudeOAuthConfig,
  getClaudeRedirectUri,
  hashClaudeOAuthState,
} from "@/lib/claude-oauth";
import { encryptCredential } from "@/lib/mcp/security";
import { createClaudeOAuthState as saveClaudeOAuthState } from "@/lib/mcp/db";
import { mcpJson } from "@/lib/mcp/http";
import { resolveBrowserSession, type BrowserSession } from "@/lib/mcp/session";
import { sanitizeReturnTo } from "@/lib/quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let session: BrowserSession | null = null;
  try {
    session = await resolveBrowserSession(request);
    const config = getClaudeOAuthConfig();
    if (!config) {
      return mcpJson(
        { error: "Claude login is not configured on this server." },
        503,
        session,
      );
    }

    const url = new URL(request.url);
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
    const redirectUri = getClaudeRedirectUri(request, config);
    const parConfig = { ...config, redirectUri };
    const state = createClaudeOAuthState();
    const { verifier, challenge } = createClaudePkcePair();
    const requestUri = await createClaudeParRequest({
      config: parConfig,
      state,
      codeChallenge: challenge,
    });

    await saveClaudeOAuthState({
      stateHash: hashClaudeOAuthState(state),
      codeVerifier: encryptCredential(verifier, session.hash, "claude-pkce"),
      sessionHash: session.hash,
      returnTo,
      redirectUri,
      userProfileId: config.userProfileId,
      ttlSeconds: 10 * 60,
    });

    return mcpJson(
      {
        authUrl: buildClaudeAuthorizeUrl(parConfig, requestUri),
      },
      200,
      session,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Claude login could not be started. Please try again.";
    return mcpJson(
      { error: message, code: "claude_error" },
      /not configured/i.test(message) ? 503 : 502,
      session,
    );
  }
}

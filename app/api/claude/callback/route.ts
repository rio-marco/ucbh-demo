import {
  exchangeClaudeCode,
  getClaudeOAuthConfig,
  hashClaudeOAuthState,
} from "@/lib/claude-oauth";
import {
  consumeClaudeOAuthState,
  saveClaudeOAuthTokens,
} from "@/lib/mcp/db";
import { redirectWithSession } from "@/lib/mcp/http";
import { resolveBrowserSession } from "@/lib/mcp/session";
import { decryptCredential } from "@/lib/mcp/security";
import { getRequestOrigin, sanitizeReturnTo } from "@/lib/quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function appendQuery(path: string, params: Record<string, string>): string {
  const url = new URL(sanitizeReturnTo(path), "http://app.local");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const baseUrl = getRequestOrigin(request);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const session = await resolveBrowserSession(request);
  const done = (params: Record<string, string>, returnTo = "/") =>
    redirectWithSession(
      `${baseUrl}${appendQuery(returnTo, params)}`,
      session,
    );

  const config = getClaudeOAuthConfig();
  if (!config) {
    return done({ claude: "error", reason: "configuration" });
  }

  const stateRecord = state
    ? await consumeClaudeOAuthState(
        hashClaudeOAuthState(state),
        session.hash,
      )
    : null;
  const returnTo = stateRecord?.return_to || "/";

  if (error) {
    return done({ claude: "error", reason: error }, returnTo);
  }
  if (!code || !state || !stateRecord) {
    return done(
      {
        claude: "error",
        reason: stateRecord ? "missing_params" : "invalid_state",
      },
      returnTo,
    );
  }

  let codeVerifier: string;
  try {
    codeVerifier = decryptCredential(
      stateRecord.code_verifier,
      session.hash,
      "claude-pkce",
    );
  } catch {
    return done({ claude: "error", reason: "invalid_state" }, returnTo);
  }

  try {
    const tokens = await exchangeClaudeCode({
      config,
      code,
      codeVerifier,
      redirectUri: stateRecord.redirect_uri,
    });
    const now = Date.now();
    await saveClaudeOAuthTokens({
      sessionHash: session.hash,
      connectionId: tokens.connectionId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scope
        ? tokens.scope.split(/\s+/).filter(Boolean)
        : config.scopes.split(/\s+/).filter(Boolean),
      accessTokenExpiresAt: tokens.expiresIn
        ? new Date(now + tokens.expiresIn * 1000)
        : null,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresIn
        ? new Date(now + tokens.refreshTokenExpiresIn * 1000)
        : null,
    });
    return done({ claude: "connected" }, returnTo);
  } catch (error) {
    console.error("Claude OAuth token exchange failed", error);
    return done(
      {
        claude: "error",
        reason: "token_exchange",
      },
      returnTo,
    );
  }
}

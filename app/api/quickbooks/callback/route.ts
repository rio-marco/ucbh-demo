import {
  consumeState,
  exchangeCodeForTokens,
  getAppOrigin,
  getQBConfig,
  getRedirectUri,
  sanitizeReturnTo,
} from "@/lib/quickbooks";
import {
  saveQuickBooksConnection,
  setPrimaryConnection,
} from "@/lib/mcp/db";
import { redirectWithSession } from "@/lib/mcp/http";
import { resolveBrowserSession } from "@/lib/mcp/session";
import { encryptCredential } from "@/lib/mcp/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add query params to a same-origin path. */
function appendQuery(path: string, params: Record<string, string>): string {
  const url = new URL(sanitizeReturnTo(path), "http://app.local");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * GET /api/quickbooks/callback
 *
 * Exchanges the code and stores the tokens under this browser session and
 * company (realm), never in a process-wide file shared by other users.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const baseUrl = getAppOrigin(request);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");

  const session = await resolveBrowserSession(request);
  const stateRecord = state
    ? await consumeState(state, session.hash)
    : null;
  const returnTo = stateRecord?.returnTo || "/";
  const done = (params: Record<string, string>) =>
    redirectWithSession(
      `${baseUrl}${appendQuery(returnTo, params)}`,
      session,
    );

  if (error) {
    console.error("QuickBooks OAuth error:", error);
    return done({ qb: "error", reason: error });
  }
  if (!code || !state || !realmId || !stateRecord) {
    return done({
      qb: "error",
      reason: stateRecord ? "missing_params" : "invalid_state",
    });
  }

  try {
    const tokens = await exchangeCodeForTokens(
      code,
      realmId,
      stateRecord.redirectUri || getRedirectUri(request),
    );
    const now = Date.now();
    await saveQuickBooksConnection({
      sessionHash: session.hash,
      realmId,
      companyName: "QuickBooks company",
      environment: getQBConfig().environment,
      accessToken: encryptCredential(
        tokens.access_token,
        session.hash,
        realmId,
      ),
      refreshToken: encryptCredential(
        tokens.refresh_token,
        session.hash,
        realmId,
      ),
      accessTokenExpiresAt: new Date(now + tokens.expires_in * 1000),
      refreshTokenExpiresAt: new Date(
        now + tokens.x_refresh_token_expires_in * 1000,
      ),
      origin: "oauth",
    });
    await setPrimaryConnection(session.hash, realmId);
    return done({ qb: "connected" });
  } catch (err) {
    console.error("QuickBooks token exchange error:", err);
    return done({ qb: "error", reason: "token_exchange" });
  }
}

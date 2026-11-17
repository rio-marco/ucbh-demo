import {
  consumeState,
  exchangeCodeForTokens,
  saveTokens,
  sanitizeReturnTo,
} from "@/lib/quickbooks";

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
 * Intuit redirects the user here after they authorize the app.
 * We receive the authorization code, exchange it for tokens,
 * save them, and redirect the user back to the workspace they
 * started from.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");

  // Consume state first so the return path is available for every branch.
  const stateRecord = state ? await consumeState(state) : null;
  const returnTo = stateRecord?.returnTo || "/";

  // Base URL for redirecting back to the app
  const baseUrl = process.env.NEXTAUTH_URL || url.origin;

  // User denied access or Intuit returned an error
  if (error) {
    console.error("QuickBooks OAuth error:", error);
    return Response.redirect(
      `${baseUrl}${appendQuery(returnTo, { qb: "error", reason: error })}`,
    );
  }

  // Validate required params
  if (!code || !state || !realmId) {
    return Response.redirect(
      `${baseUrl}${appendQuery(returnTo, {
        qb: "error",
        reason: "missing_params",
      })}`,
    );
  }

  // Validate CSRF state
  if (!stateRecord) {
    return Response.redirect(
      `${baseUrl}${appendQuery(returnTo, {
        qb: "error",
        reason: "invalid_state",
      })}`,
    );
  }

  try {
    // Exchange code for access + refresh tokens
    const tokens = await exchangeCodeForTokens(code, realmId);
    await saveTokens(tokens);

    // Redirect back to the page the user started the connection from.
    return Response.redirect(
      `${baseUrl}${appendQuery(returnTo, { qb: "connected" })}`,
    );
  } catch (err) {
    console.error("QuickBooks token exchange error:", err);
    return Response.redirect(
      `${baseUrl}${appendQuery(returnTo, {
        qb: "error",
        reason: "token_exchange",
      })}`,
    );
  }
}

import {
  validateState,
  exchangeCodeForTokens,
  saveTokens,
} from "@/lib/quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/quickbooks/callback
 *
 * Intuit redirects the user here after they authorize the app.
 * We receive the authorization code, exchange it for tokens,
 * save them, and redirect the user back to the agent page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");

  // Base URL for redirecting back to the app
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  // User denied access or Intuit returned an error
  if (error) {
    console.error("QuickBooks OAuth error:", error);
    return Response.redirect(
      `${baseUrl}?qb=error&reason=${encodeURIComponent(error)}`,
    );
  }

  // Validate required params
  if (!code || !state || !realmId) {
    return Response.redirect(`${baseUrl}?qb=error&reason=missing_params`);
  }

  // Validate CSRF state
  const stateValid = await validateState(state);
  if (!stateValid) {
    return Response.redirect(`${baseUrl}?qb=error&reason=invalid_state`);
  }

  try {
    // Exchange code for access + refresh tokens
    const tokens = await exchangeCodeForTokens(code, realmId);
    await saveTokens(tokens);

    // Redirect back to the app with success indicator
    // We redirect to the root; the frontend will pick up the query param
    return Response.redirect(`${baseUrl}?qb=connected`);
  } catch (err) {
    console.error("QuickBooks token exchange error:", err);
    return Response.redirect(`${baseUrl}?qb=error&reason=token_exchange`);
  }
}

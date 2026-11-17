import {
  getQBConfig,
  generateState,
  INTUIT_AUTH_URL,
  QB_SCOPES,
} from "@/lib/quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/quickbooks/auth
 *
 * Generates the Intuit OAuth2 authorization URL and returns it.
 * The frontend redirects the browser to this URL so the user can
 * log in on Intuit's site and authorize the app.
 */
export async function GET() {
  const { clientId, redirectUri } = getQBConfig();

  if (!clientId || clientId === "your_client_id_here") {
    return Response.json(
      {
        error:
          "QuickBooks is not configured. Set QB_CLIENT_ID and QB_CLIENT_SECRET in .env.local.",
      },
      { status: 503 },
    );
  }

  const state = await generateState();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: QB_SCOPES,
    state,
  });

  const authUrl = `${INTUIT_AUTH_URL}?${params.toString()}`;

  return Response.json({ authUrl });
}

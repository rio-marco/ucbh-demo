import {
  loadTokens,
  deleteTokens,
  qbApiRequest,
  isTokenExpired,
} from "@/lib/quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/quickbooks/status
 *
 * Check whether a valid QuickBooks connection exists.
 * Returns { connected: true, companyName, realmId } or { connected: false }.
 */
export async function GET() {
  const tokens = await loadTokens();

  if (!tokens) {
    return Response.json({ connected: false });
  }

  try {
    // Try to fetch company info to verify the connection is alive
    const { data } = await qbApiRequest<{
      CompanyInfo: { CompanyName: string };
    }>(
      "companyinfo/" + tokens.realm_id,
      tokens,
    );

    return Response.json({
      connected: true,
      companyName: data.CompanyInfo?.CompanyName || "Unknown",
      realmId: tokens.realm_id,
    });
  } catch {
    // Tokens exist but API call failed — connection may be stale
    return Response.json({
      connected: true,
      companyName: null,
      realmId: tokens.realm_id,
      warning: "Could not verify connection. Token may need refresh.",
    });
  }
}

/**
 * DELETE /api/quickbooks/status
 *
 * Disconnect QuickBooks by removing stored tokens.
 */
export async function DELETE() {
  const removed = await deleteTokens();
  return Response.json({ ok: true, disconnected: removed });
}

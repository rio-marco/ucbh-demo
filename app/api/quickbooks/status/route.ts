import { revokeQuickBooksTokens } from "@/lib/quickbooks";
import { getPrimaryConnection, disconnectConnection, listConnections } from "@/lib/mcp/db";
import { mcpErrorCode, mcpErrorMessage } from "@/lib/mcp/config";
import { mcpJson } from "@/lib/mcp/http";
import { getCompanyName } from "@/lib/mcp/quickbooks";
import { resolveBrowserSession } from "@/lib/mcp/session";
import { decryptCredential } from "@/lib/mcp/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/quickbooks/status
 *
 * Reports the QuickBooks company connected to this browser session.
 */
export async function GET(request: Request) {
  const session = await resolveBrowserSession(request);
  const connection = await getPrimaryConnection(session.hash);

  if (!connection?.is_connected) {
    return mcpJson({ connected: false }, 200, session);
  }

  try {
    const companyName = await getCompanyName(session.hash, connection);
    const connections = await listConnections(session.hash);
    return mcpJson(
      {
        connected: true,
        companyName,
        realmId: connection.realm_id,
        environment: connection.environment,
        connectionCount: connections.filter(
          (item) => item.is_connected && item.origin === "oauth",
        ).length,
      },
      200,
      session,
    );
  } catch (error) {
    return mcpJson(
      {
        connected: false,
        stale: true,
        companyName: null,
        realmId: connection.realm_id,
        reason: mcpErrorCode(error),
        error: mcpErrorMessage(error),
      },
      200,
      session,
    );
  }
}

/** DELETE /api/quickbooks/status — disconnect only this session's company. */
export async function DELETE(request: Request) {
  const session = await resolveBrowserSession(request);
  const connection = await getPrimaryConnection(session.hash);
  if (connection) {
    try {
      const tokens = [
        decryptCredential(
          connection.access_token,
          session.hash,
          connection.realm_id,
        ),
        decryptCredential(
          connection.refresh_token,
          session.hash,
          connection.realm_id,
        ),
      ];
      await revokeQuickBooksTokens(tokens);
    } catch {}
  }
  const disconnected = await disconnectConnection(session.hash);
  return mcpJson({ ok: true, disconnected: disconnected > 0 }, 200, session);
}

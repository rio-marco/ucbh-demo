import {
  assertMcpSecretsConfigured,
  mcpErrorCode,
  mcpErrorMessage,
} from "@/lib/mcp/config";
import {
  appendAuditLog,
  disconnectConnection,
  getPrimaryConnection,
  listConnections,
} from "@/lib/mcp/db";
import { mcpErrorResponse, mcpJson } from "@/lib/mcp/http";
import { getCompanyName } from "@/lib/mcp/quickbooks";
import { resolveBrowserSession } from "@/lib/mcp/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await resolveBrowserSession(request);
    assertMcpSecretsConfigured();
    const connection = await getPrimaryConnection(session.hash);
    const connections = await listConnections(session.hash);
    let companyName: string | null = null;
    let stale = false;
    let reason: string | null = null;
    let error: string | null = null;

    if (connection?.is_connected) {
      try {
        companyName = await getCompanyName(session.hash, connection);
      } catch (verificationError) {
        stale = true;
        reason = mcpErrorCode(verificationError);
        error = mcpErrorMessage(verificationError);
      }
    }

    return mcpJson(
      {
        connected: Boolean(connection?.is_connected) && !stale,
        stale,
        companyName,
        environment: connection?.is_connected ? connection.environment : null,
        connectionCount: connections.filter(
          (item) => item.is_connected && item.origin === "oauth",
        ).length,
        reason,
        error,
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
    const updated = await disconnectConnection(session.hash);
    await appendAuditLog({
      sessionHash: session.hash,
      realmId: null,
      event: "disconnect",
      ok: true,
      durationMs: 0,
    });
    return mcpJson({ ok: true, disconnected: updated > 0 }, 200, session);
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

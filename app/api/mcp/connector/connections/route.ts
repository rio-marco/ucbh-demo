import { listConnections, setPrimaryConnection } from "@/lib/mcp/db";
import { mcpErrorResponse, mcpJson } from "@/lib/mcp/http";
import { resolveBrowserSession } from "@/lib/mcp/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await resolveBrowserSession(request);
    const connections = await listConnections(session.hash);
    return mcpJson(
      {
        connections: connections.map((connection) => ({
          realmId: connection.realm_id,
          companyName: connection.company_name,
          environment: connection.environment,
          isConnected: connection.is_connected,
          isPrimary: connection.is_primary,
          connectedAt: connection.updated_at.toISOString(),
        })),
      },
      200,
      session,
    );
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await resolveBrowserSession(request);
    const body = (await request.json().catch(() => null)) as {
      realmId?: unknown;
    } | null;
    const realmId =
      typeof body?.realmId === "string" ? body.realmId.slice(0, 100) : "";
    if (!realmId) {
      return mcpJson({ error: "Choose a connected QuickBooks company." }, 400, session);
    }
    const selected = await setPrimaryConnection(session.hash, realmId);
    return mcpJson(
      selected
        ? { ok: true }
        : { error: "That company is not connected to this browser session." },
      selected ? 200 : 400,
      session,
    );
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

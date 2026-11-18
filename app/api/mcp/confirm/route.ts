import { getRequestOrigin } from "@/lib/quickbooks";
import { mcpErrorCode, McpError } from "@/lib/mcp/config";
import { initializeMcpSession, callMcpTool } from "@/lib/mcp/client";
import {
  appendAuditLog,
  cancelPendingOperation,
  getPrimaryConnection,
  isOperationId,
} from "@/lib/mcp/db";
import { mcpErrorResponse, mcpJson } from "@/lib/mcp/http";
import { resolveBrowserSession } from "@/lib/mcp/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const started = Date.now();
  let session: Awaited<ReturnType<typeof resolveBrowserSession>> | null = null;
  try {
    session = await resolveBrowserSession(request);
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return mcpJson({ error: "Content-Type must be application/json." }, 415, session);
    }
    const body = (await request.json().catch(() => null)) as {
      confirmationId?: unknown;
      confirmationSecret?: unknown;
      confirm?: unknown;
    } | null;

    const confirmationId =
      typeof body?.confirmationId === "string" ? body.confirmationId : "";
    const confirmationSecret =
      typeof body?.confirmationSecret === "string" ? body.confirmationSecret : "";
    if (!isOperationId(confirmationId) || !confirmationSecret) {
      throw new McpError("confirmation_invalid");
    }

    if (body?.confirm !== true) {
      await cancelPendingOperation(confirmationId, session.hash);
      await appendAuditLog({
        sessionHash: session.hash,
        realmId: null,
        event: "update_cancelled",
        ok: true,
        durationMs: Date.now() - started,
        confirmationId,
      });
      return mcpJson({ ok: true, cancelled: true }, 200, session);
    }

    const connection = await getPrimaryConnection(session.hash);
    if (!connection?.is_connected) throw new McpError("not_connected");

    const origin = getRequestOrigin(request);
    await initializeMcpSession(origin, session.hash);
    const result = await callMcpTool(origin, session.hash, "qb_apply_update", {
      confirmation_id: confirmationId,
      confirmation_secret: confirmationSecret,
    });
    const text = (result.content ?? [])
      .map((item) => ("text" in item && typeof item.text === "string" ? item.text : ""))
      .filter(Boolean)
      .join("\n");

    if (result.isError) {
      throw new McpError("confirmation_invalid", text);
    }

    await appendAuditLog({
      sessionHash: session.hash,
      realmId: connection.realm_id,
      event: "update_confirmed",
      ok: true,
      durationMs: Date.now() - started,
      confirmationId,
    });

    return mcpJson({ ok: true, result: text }, 200, session);
  } catch (error) {
    await appendAuditLog({
      sessionHash: session?.hash ?? "unknown",
      realmId: null,
      event: "update_confirmed",
      ok: false,
      errorCode: mcpErrorCode(error),
      durationMs: Date.now() - started,
    });
    return mcpErrorResponse(error);
  }
}

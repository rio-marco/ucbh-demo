import { getRequestOrigin } from "@/lib/quickbooks";
import { runMcpChat } from "@/lib/claude-mcp";
import { assertMcpSecretsConfigured, McpError } from "@/lib/mcp/config";
import { appendAuditLog, getPrimaryConnection } from "@/lib/mcp/db";
import { mcpErrorResponse, mcpJson } from "@/lib/mcp/http";
import { mcpErrorCode } from "@/lib/mcp/config";
import { resolveBrowserSession } from "@/lib/mcp/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const started = Date.now();
  let session: Awaited<ReturnType<typeof resolveBrowserSession>> | null = null;
  try {
    session = await resolveBrowserSession(request);
    assertMcpSecretsConfigured();

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return mcpJson({ error: "Content-Type must be application/json." }, 415, session);
    }

    const body = (await request.json().catch(() => null)) as {
      prompt?: unknown;
    } | null;
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt || prompt.length > 20_000) {
      return mcpJson(
        { error: "Enter a prompt of 20,000 characters or fewer." },
        400,
        session,
      );
    }

    const connection = await getPrimaryConnection(session.hash);
    if (!connection?.is_connected) throw new McpError("not_connected");

    const result = await runMcpChat({
      prompt,
      sessionHash: session.hash,
      origin: getRequestOrigin(request),
      signal: request.signal,
    });

    await appendAuditLog({
      sessionHash: session.hash,
      realmId: connection.realm_id,
      event: "chat",
      ok: true,
      durationMs: Date.now() - started,
    });

    return mcpJson(
      {
        answer: result.answer,
        pendingOperations: result.pendingOperations,
        toolsUsed: result.toolsUsed,
        usage: result.usage,
      },
      200,
      session,
    );
  } catch (error) {
    await appendAuditLog({
      sessionHash: session?.hash ?? "unknown",
      realmId: null,
      event: "chat",
      ok: false,
      errorCode: mcpErrorCode(error),
      durationMs: Date.now() - started,
    });
    return mcpErrorResponse(error);
  }
}

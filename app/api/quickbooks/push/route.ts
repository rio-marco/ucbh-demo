import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getRequestOrigin } from "@/lib/quickbooks";
import { parseQuickBooksUpdates } from "@/lib/quickbooks-entities";
import { mcpErrorMessage } from "@/lib/mcp/config";
import { getAgentPermissions, getPrimaryConnection } from "@/lib/mcp/db";
import { mcpJson } from "@/lib/mcp/http";
import { ensureWritesAllowed, qbUpdate } from "@/lib/mcp/quickbooks";
import { resolveBrowserSession } from "@/lib/mcp/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), ".data");

type PushResult = {
  entity: string;
  id: string;
  ok: boolean;
  syncToken?: string;
  error?: string;
};

/**
 * POST /api/quickbooks/push
 *
 * Apply approved AI-proposed updates to the QuickBooks company connected to
 * this browser session. Sandbox-only by default: production writes require
 * QB_ALLOW_PRODUCTION_WRITES=true.
 */
export async function POST(request: Request) {
  const session = await resolveBrowserSession(request);
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return mcpJson(
      { error: "Content-Type must be application/json." },
      415,
      session,
    );
  }

  if (request.headers.get("x-qb-confirm") !== "push") {
    return mcpJson(
      { error: "Missing QuickBooks write confirmation header." },
      400,
      session,
    );
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== getRequestOrigin(request)) {
    return mcpJson(
      { error: "Cross-origin QuickBooks writes are not allowed." },
      403,
      session,
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 2_000_000) {
    return mcpJson(
      { error: "QuickBooks update payload is too large." },
      413,
      session,
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { sessionId?: unknown; operations?: unknown }
    | null;
  if (!body) {
    return mcpJson({ error: "Invalid JSON body." }, 400, session);
  }

  const parsed = parseQuickBooksUpdates(body.operations);
  if (!parsed.operations) {
    return mcpJson(
      { error: parsed.error || "Invalid update operations." },
      400,
      session,
    );
  }

  const connection = await getPrimaryConnection(session.hash);
  if (!connection?.is_connected) {
    return mcpJson({ error: "QuickBooks is not connected." }, 401, session);
  }

  try {
    ensureWritesAllowed(connection.environment);
  } catch (error) {
    return mcpJson({ error: mcpErrorMessage(error) }, 403, session);
  }

  const permissions = await getAgentPermissions(session.hash);
  if (!permissions.includes("update")) {
    return mcpJson(
      { error: "Grant the Update permission before pushing changes." },
      403,
      session,
    );
  }

  const results: PushResult[] = [];

  for (const operation of parsed.operations) {
    try {
      const data = await qbUpdate<Record<string, unknown>>(
        session.hash,
        connection,
        operation.entity,
        {
          ...operation.fields,
          Id: operation.id,
          SyncToken: operation.syncToken,
          sparse: true,
        },
      );
      results.push({
        entity: operation.entity,
        id: operation.id,
        ok: true,
        syncToken:
          typeof data?.SyncToken === "string" ? data.SyncToken : undefined,
      });
    } catch (error) {
      results.push({
        entity: operation.entity,
        id: operation.id,
        ok: false,
        error: mcpErrorMessage(error),
      });
    }
  }

  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.slice(0, 100) : null;

  // Append-only audit trail. Never store tokens or full record payloads.
  await mkdir(DATA_DIR, { recursive: true })
    .then(() =>
      appendFile(
        path.join(DATA_DIR, "quickbooks-push-log.jsonl"),
        `${JSON.stringify({
          at: new Date().toISOString(),
          realmId: connection.realm_id,
          environment: connection.environment,
          sessionId,
          results,
        })}\n`,
        "utf8",
      ),
    )
    .catch((error) => console.error("QuickBooks audit log failed", error));

  return mcpJson(
    {
      ok: results.every((result) => result.ok),
      environment: connection.environment,
      results,
    },
    200,
    session,
  );
}

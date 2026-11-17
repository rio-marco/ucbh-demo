import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  getQBConfig,
  getRequestOrigin,
  loadTokens,
  qbApiUpdate,
} from "@/lib/quickbooks";
import { parseQuickBooksUpdates } from "@/lib/quickbooks-entities";

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
 * Apply approved AI-proposed updates to existing QuickBooks records.
 * Sandbox-only by default: production writes require
 * QB_ALLOW_PRODUCTION_WRITES=true.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return Response.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  if (request.headers.get("x-qb-confirm") !== "push") {
    return Response.json(
      { error: "Missing QuickBooks write confirmation header." },
      { status: 400 },
    );
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== getRequestOrigin(request)) {
    return Response.json(
      { error: "Cross-origin QuickBooks writes are not allowed." },
      { status: 403 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 2_000_000) {
    return Response.json(
      { error: "QuickBooks update payload is too large." },
      { status: 413 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { sessionId?: unknown; operations?: unknown }
    | null;
  if (!body) {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseQuickBooksUpdates(body.operations);
  if (!parsed.operations) {
    return Response.json(
      { error: parsed.error || "Invalid update operations." },
      { status: 400 },
    );
  }

  const { environment } = getQBConfig();
  if (
    environment === "production" &&
    process.env.QB_ALLOW_PRODUCTION_WRITES !== "true"
  ) {
    return Response.json(
      {
        error:
          "Production QuickBooks writes are disabled. Use a sandbox company or set QB_ALLOW_PRODUCTION_WRITES=true.",
      },
      { status: 403 },
    );
  }

  const tokens = await loadTokens();
  if (!tokens) {
    return Response.json(
      { error: "QuickBooks is not connected." },
      { status: 401 },
    );
  }

  let currentTokens = tokens;
  const results: PushResult[] = [];

  for (const operation of parsed.operations) {
    try {
      const { data, tokens: updatedTokens } = await qbApiUpdate<Record<
        string,
        unknown
      >>(operation.entity, currentTokens, {
        ...operation.fields,
        Id: operation.id,
        SyncToken: operation.syncToken,
        sparse: true,
      });
      currentTokens = updatedTokens;
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
        error: error instanceof Error ? error.message : "Update failed.",
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
          realmId: tokens.realm_id,
          environment,
          sessionId,
          results,
        })}\n`,
        "utf8",
      ),
    )
    .catch((error) => console.error("QuickBooks audit log failed", error));

  return Response.json({
    ok: results.every((result) => result.ok),
    environment,
    results,
  });
}

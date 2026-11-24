import { mcpErrorMessage, McpError } from "@/lib/mcp/config";
import { getPrimaryConnection } from "@/lib/mcp/db";
import { mcpJson } from "@/lib/mcp/http";
import { qbGet } from "@/lib/mcp/quickbooks";
import { resolveBrowserSession } from "@/lib/mcp/session";
import {
  QB_RECORD_DEFINITIONS,
  type QuickBooksRecordDefinition,
} from "@/lib/quickbooks-entities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;
const MAX_PAGES = 5;

/**
 * GET /api/quickbooks/data
 *
 * Fetches supported record types from the QuickBooks company connected to
 * this browser session.
 */
export async function GET(request: Request) {
  const session = await resolveBrowserSession(request);
  const connection = await getPrimaryConnection(session.hash);
  if (!connection?.is_connected) {
    return mcpJson({ error: "QuickBooks is not connected." }, 401, session);
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "all";
  const selectedRecords: QuickBooksRecordDefinition[] =
    type === "all"
      ? QB_RECORD_DEFINITIONS
      : QB_RECORD_DEFINITIONS.filter(
          (definition) =>
            definition.key === type ||
            definition.entity.toLowerCase() === type.toLowerCase(),
        );

  if (type !== "all" && selectedRecords.length === 0) {
    return mcpJson(
      { error: `Unknown QuickBooks record type: ${type}` },
      400,
      session,
    );
  }

  try {
    const result: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    for (const definition of selectedRecords) {
      try {
        const rows: unknown[] = [];
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const startPosition = page * PAGE_SIZE + 1;
          const statement = `SELECT * FROM ${definition.entity} STARTPOSITION ${startPosition} MAXRESULTS ${PAGE_SIZE}`;
          const data = await qbGet<{
            QueryResponse?: Record<string, unknown[]>;
          }>(
            session.hash,
            connection,
            `query?query=${encodeURIComponent(statement)}`,
          );
          const pageRows = data.QueryResponse?.[definition.entity];
          if (!Array.isArray(pageRows)) break;
          rows.push(...pageRows);
          if (pageRows.length < PAGE_SIZE) break;
        }
        result[definition.key] = {
          QueryResponse: { [definition.entity]: rows },
        };
      } catch (error) {
        errors[definition.key] = mcpErrorMessage(error);
      }
    }

    return mcpJson(
      {
        ok: true,
        realmId: connection.realm_id,
        data: result,
        errors,
      },
      200,
      session,
    );
  } catch (error) {
    console.error("QuickBooks data fetch error:", error);
    return mcpJson(
      {
        error:
          error instanceof McpError
            ? error.message
            : "Failed to fetch QuickBooks data. The connection may have expired.",
      },
      500,
      session,
    );
  }
}

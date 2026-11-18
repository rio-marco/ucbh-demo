import { loadTokens, qbApiRequest } from "@/lib/quickbooks";
import {
  QB_RECORD_DEFINITIONS,
  type QuickBooksRecordDefinition,
} from "@/lib/quickbooks-entities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;
const MAX_PAGES = 5;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown QuickBooks error";

/**
 * GET /api/quickbooks/data
 *
 * Fetches the supported record types from QuickBooks and returns a combined
 * payload. The record types are defined in lib/quickbooks-entities.ts.
 *
 * Query params:
 *   ?type=all (default) — fetch customers, vendors, employees and invoices
 *   ?type=customers|vendors|employees|invoices — one record type
 */
export async function GET(request: Request) {
  const tokens = await loadTokens();
  if (!tokens) {
    return Response.json(
      { error: "QuickBooks is not connected." },
      { status: 401 },
    );
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
    return Response.json(
      { error: `Unknown QuickBooks record type: ${type}` },
      { status: 400 },
    );
  }

  try {
    const result: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    let currentTokens = tokens;

    for (const definition of selectedRecords) {
      try {
        const rows: unknown[] = [];
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const startPosition = page * PAGE_SIZE + 1;
          const statement = `SELECT * FROM ${definition.entity} STARTPOSITION ${startPosition} MAXRESULTS ${PAGE_SIZE}`;
          const { data, tokens: updatedTokens } = await qbApiRequest<{
            QueryResponse?: Record<string, unknown[]>;
          }>(`query?query=${encodeURIComponent(statement)}`, currentTokens);
          currentTokens = updatedTokens;
          const pageRows = data.QueryResponse?.[definition.entity];
          if (!Array.isArray(pageRows)) break;
          rows.push(...pageRows);
          if (pageRows.length < PAGE_SIZE) break;
        }
        result[definition.key] = {
          QueryResponse: { [definition.entity]: rows },
        };
      } catch (error) {
        errors[definition.key] = errorText(error);
      }
    }

    return Response.json({
      ok: true,
      realmId: currentTokens.realm_id,
      data: result,
      errors,
    });
  } catch (error) {
    console.error("QuickBooks data fetch error:", error);
    return Response.json(
      {
        error:
          "Failed to fetch QuickBooks data. The connection may have expired.",
      },
      { status: 500 },
    );
  }
}

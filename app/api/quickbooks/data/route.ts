import { loadTokens, qbApiRequest } from "@/lib/quickbooks";
import {
  QB_RECORD_DEFINITIONS,
  QB_REPORT_DEFINITIONS,
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
 * Fetch company data from QuickBooks. Queries every record type and report
 * listed in lib/quickbooks-entities.ts and returns a combined payload.
 *
 * Query params:
 *   ?type=all (default) — fetch everything
 *   ?type=company — company info
 *   ?type=reports — financial reports
 *   ?type=invoices|customers|vendors|items|... — one record type
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
    type === "all" || type === "company" || type === "reports"
      ? QB_RECORD_DEFINITIONS
      : QB_RECORD_DEFINITIONS.filter(
          (definition) =>
            definition.key === type ||
            definition.entity.toLowerCase() === type.toLowerCase(),
        );

  if (
    type !== "all" &&
    type !== "company" &&
    type !== "reports" &&
    selectedRecords.length === 0
  ) {
    return Response.json(
      { error: `Unknown QuickBooks record type: ${type}` },
      { status: 400 },
    );
  }

  try {
    const result: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    let currentTokens = tokens;

    const query = async (endpoint: string, key: string) => {
      const { data, tokens: updatedTokens } = await qbApiRequest<Record<
        string,
        unknown
      >>(endpoint, currentTokens);
      currentTokens = updatedTokens;
      result[key] = data;
    };

    const fetchAllRecords = async (definition: QuickBooksRecordDefinition) => {
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
    };

    if (type === "all" || type === "company") {
      try {
        await query(
          `companyinfo/${currentTokens.realm_id}`,
          "companyInfo",
        );
      } catch (error) {
        errors.companyInfo = errorText(error);
      }
    }

    const shouldFetchRecords = type !== "company" && type !== "reports";
    if (shouldFetchRecords) {
      for (const definition of selectedRecords) {
        try {
          await fetchAllRecords(definition);
        } catch (error) {
          errors[definition.key] = errorText(error);
        }
      }
    }

    if (type === "all" || type === "reports") {
      for (const definition of QB_REPORT_DEFINITIONS) {
        try {
          await query(definition.endpoint, definition.key);
        } catch (error) {
          errors[definition.key] = errorText(error);
        }
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

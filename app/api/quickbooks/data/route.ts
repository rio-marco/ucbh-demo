import { loadTokens, qbApiRequest } from "@/lib/quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/quickbooks/data
 *
 * Fetch company data from QuickBooks. Queries multiple endpoints
 * and returns a combined payload. Auto-refreshes expired tokens.
 *
 * Query params:
 *   ?type=all (default) — fetch everything
 *   ?type=company — just company info
 *   ?type=invoices — invoices
 *   ?type=customers — customers
 *   ?type=vendors — vendors
 *   ?type=items — products / inventory
 *   ?type=reports — financial reports (P&L, Balance Sheet)
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

  try {
    const result: Record<string, unknown> = {};
    let currentTokens = tokens;

    // Helper to make a request and keep tokens updated
    const query = async <T = Record<string, unknown>>(
      endpoint: string,
      key: string,
    ) => {
      const { data, tokens: updatedTokens } = await qbApiRequest<T>(
        endpoint,
        currentTokens,
      );
      currentTokens = updatedTokens;
      result[key] = data;
    };

    // Company Info (always fetched for context)
    if (type === "all" || type === "company") {
      await query(`companyinfo/${currentTokens.realm_id}`, "companyInfo");
    }

    const entityQuery = (entity: string) =>
      `query?query=${encodeURIComponent(
        `SELECT * FROM ${entity} MAXRESULTS 100`,
      )}`;

    // Customers
    if (type === "all" || type === "customers") {
      await query(entityQuery("Customer"), "customers");
    }

    // Vendors
    if (type === "all" || type === "vendors") {
      await query(entityQuery("Vendor"), "vendors");
    }

    // Items (Products / Inventory)
    if (type === "all" || type === "items") {
      await query(entityQuery("Item"), "items");
    }

    // Invoices
    if (type === "all" || type === "invoices") {
      await query(entityQuery("Invoice"), "invoices");
    }

    // Financial reports
    if (type === "all" || type === "reports") {
      // Profit and Loss
      await query(
        "reports/ProfitAndLoss?date_macro=This Fiscal Year-to-date",
        "profitAndLoss",
      ).catch((err) => {
        console.warn("P&L report fetch failed:", err);
        result.profitAndLoss = null;
      });

      // Balance Sheet
      await query(
        "reports/BalanceSheet?date_macro=This Fiscal Year-to-date",
        "balanceSheet",
      ).catch((err) => {
        console.warn("Balance Sheet report fetch failed:", err);
        result.balanceSheet = null;
      });
    }

    return Response.json({
      ok: true,
      realmId: currentTokens.realm_id,
      data: result,
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

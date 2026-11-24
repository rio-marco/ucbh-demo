import { normalizeAgentPermissions } from "@/lib/agent-permissions";
import {
  clearAgentPermissions,
  getAgentPermissions,
  setAgentPermissions,
} from "@/lib/mcp/db";
import { mcpErrorResponse, mcpJson } from "@/lib/mcp/http";
import { resolveBrowserSession } from "@/lib/mcp/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await resolveBrowserSession(request);
    const scopes = await getAgentPermissions(session.hash);
    return mcpJson({ scopes }, 200, session);
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await resolveBrowserSession(request);
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return mcpJson(
        { error: "Content-Type must be application/json." },
        415,
        session,
      );
    }
    const body = (await request.json().catch(() => null)) as {
      scopes?: unknown;
    } | null;
    const scopes = normalizeAgentPermissions(body?.scopes);
    if (!scopes.includes("read")) {
      return mcpJson(
        {
          error:
            "View company data is required so the agent can read QuickBooks records.",
        },
        400,
        session,
      );
    }
    const saved = await setAgentPermissions(session.hash, scopes);
    return mcpJson({ scopes: saved }, 200, session);
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await resolveBrowserSession(request);
    await clearAgentPermissions(session.hash);
    return mcpJson({ scopes: [] }, 200, session);
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

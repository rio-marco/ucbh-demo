import {
  clearClaudeAuth,
  consumeClaudeOAuthState,
  getClaudeAuth,
  saveClaudeAuth,
} from "@/lib/mcp/db";
import { mcpErrorResponse, mcpJson } from "@/lib/mcp/http";
import { resolveBrowserSession } from "@/lib/mcp/session";
import { hashValue } from "@/lib/mcp/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await resolveBrowserSession(request);
    const auth = await getClaudeAuth(session.hash);
    return mcpJson(
      {
        connected: Boolean(auth),
        mode: auth?.mode ?? null,
        profile: auth
          ? { id: auth.user_id, email: auth.email }
          : null,
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
    const body = (await request.json().catch(() => ({}))) as {
      state?: unknown;
    };
    const state = typeof body.state === "string" ? body.state : "";
    if (!state) {
      return mcpJson({ error: "Missing sign-in state." }, 400, session);
    }
    const record = await consumeClaudeOAuthState(hashValue(state), session.hash);
    if (!record) {
      return mcpJson(
        { error: "The sign-in session expired. Please try again." },
        400,
        session,
      );
    }
    const auth = await saveClaudeAuth({
      sessionHash: session.hash,
      userId: `claude-${session.hash.slice(0, 12)}`,
      email: null,
      mode: "demo",
    });
    return mcpJson(
      { connected: true, mode: auth.mode },
      200,
      session,
    );
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await resolveBrowserSession(request);
    await clearClaudeAuth(session.hash);
    return mcpJson({ ok: true }, 200, session);
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

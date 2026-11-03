import { clearAgentRuntimeHistory } from "@/lib/agent-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get("sessionId") || undefined;
    const result = await clearAgentRuntimeHistory(sessionId);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Agent runtime cleanup failed", error);
    return Response.json(
      { error: "Could not clear Agent runtime history on this server." },
      { status: 500 },
    );
  }
}

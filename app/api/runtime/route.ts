import { clearAgentRuntimeHistory } from "@/lib/agent-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  try {
    const result = await clearAgentRuntimeHistory();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Agent runtime cleanup failed", error);
    return Response.json(
      { error: "Could not clear Agent runtime history on this server." },
      { status: 500 },
    );
  }
}

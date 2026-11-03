import { AGENTS } from "@/data/agents";
import {
  SESSION_STATUSES,
  deleteSession,
  listSessions,
  upsertSession,
} from "@/lib/sessions";
import type { SessionStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) =>
  Response.json({ error }, { status });

function cleanTitle(prompt: string) {
  const firstLine = prompt
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  const title = firstLine || "Untitled task";
  return title.length > 90 ? `${title.slice(0, 87)}…` : title;
}

export async function GET(request: Request) {
  const agentId = new URL(request.url).searchParams.get("agentId") || undefined;
  return Response.json({ sessions: await listSessions(agentId) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return bad("A JSON body is required.");

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const agent = AGENTS.find((item) => item.id === agentId);
  if (!id || id.length > 64) return bad("A valid session id is required.");
  if (!agent) return bad("Select a valid agent.");

  const prompt =
    typeof body.prompt === "string" ? body.prompt.slice(0, 20_000) : "";
  const status = (
    typeof body.status === "string" &&
    SESSION_STATUSES.includes(body.status as SessionStatus)
      ? body.status
      : "running"
  ) as SessionStatus;
  const files = Array.isArray(body.files)
    ? body.files
        .filter(
          (file): file is { name: string; size: number } =>
            Boolean(file) &&
            typeof (file as { name?: unknown }).name === "string" &&
            typeof (file as { size?: unknown }).size === "number",
        )
        .slice(0, 10)
        .map((file) => ({
          name: String(file.name).slice(0, 200),
          size: Math.max(0, Math.round(file.size)),
        }))
    : [];
  const inputTokens =
    typeof body.inputTokens === "number" ? body.inputTokens : 0;
  const outputTokens =
    typeof body.outputTokens === "number" ? body.outputTokens : 0;
  const outputs = typeof body.outputs === "number" ? body.outputs : 0;
  const environment = body.environment === "shared" ? "shared" : "private";
  const fee = typeof body.fee === "number" ? Math.max(0, body.fee) : 0;
  const result = typeof body.result === "string" ? body.result.slice(0, 50_000) : "";
  const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.slice(0, 20_000) : "";
  const trace = Array.isArray(body.trace)
    ? body.trace.filter((entry): entry is string => typeof entry === "string").slice(-200)
    : [];
  const sourceFiles = Array.isArray(body.sourceFiles)
    ? body.sourceFiles
        .filter((file): file is { name: string; content: string; size: number } =>
          Boolean(file) &&
          typeof (file as { name?: unknown }).name === "string" &&
          typeof (file as { content?: unknown }).content === "string" &&
          typeof (file as { size?: unknown }).size === "number")
        .slice(0, 10)
        .map((file) => ({ ...file }))
    : undefined;
  if (
    sourceFiles &&
    (sourceFiles.some((file) => file.content.length > 2_000_000) ||
      sourceFiles.reduce((total, file) => total + file.content.length, 0) > 8_000_000)
  ) {
    return bad("Saved task files exceed the run storage limit.");
  }

  const session = await upsertSession({
    id,
    agentId,
    agentName: agent.name,
    title:
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 90)
        : cleanTitle(prompt),
    status,
    prompt,
    files,
    inputTokens,
    outputTokens,
    outputs,
    environment,
    fee,
    result,
    reviewNote,
    trace,
    sourceFiles,
  });

  const { sourceFiles: _sourceFiles, ...publicSession } = session;
  return Response.json({ session: publicSession });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) return bad("Provide a session id to delete.");
  const removed = await deleteSession(id);
  if (!removed) return bad("Session not found.", 404);
  return Response.json({ ok: true, removed: 1 });
}

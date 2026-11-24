import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentMcpConfig } from "@/lib/agent-mcp";
import { AGENT_TEMP_PREFIX } from "@/lib/agent-runtime";
import { AGENTS } from "@/data/agents";
import { getClaudeConfig, runClaudeAgent } from "@/lib/claude";
import { getClaudeSessionCredentials } from "@/lib/claude-session";
import { getAgentPermissions, getPrimaryConnection } from "@/lib/mcp/db";
import { mcpErrorResponse, mcpJson } from "@/lib/mcp/http";
import { getRequestOrigin } from "@/lib/quickbooks";
import {
  resolveBrowserSession,
  type BrowserSession,
} from "@/lib/mcp/session";
import { sessionCookieHeader } from "@/lib/mcp/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const session = await resolveBrowserSession(request);
    const credentials = await getClaudeSessionCredentials(session.hash);
    if (!credentials) {
      return mcpJson(
        {
          ready: false,
          reason: "auth",
          provider: "Claude",
          message: "Connect your Claude organization to continue.",
        },
        200,
        session,
      );
    }
    return mcpJson(
      { ready: true, provider: "Claude", model: getClaudeConfig().model },
      200,
      session,
    );
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

type ExecuteBody = {
  agentId?: string;
  sessionId?: string;
  prompt?: string;
  files?: { name: string; content: string }[];
  quickBooksCounts?: string[];
};

const json = (error: string, status: number, session: BrowserSession) =>
  mcpJson({ error }, status, session);

export async function POST(request: Request) {
  const session = await resolveBrowserSession(request);
  const credentials = await getClaudeSessionCredentials(session.hash);
  if (!credentials) {
    return mcpJson(
      { error: "Connect your Claude organization to continue." },
      401,
      session,
    );
  }

  const body = (await request.json().catch(() => null)) as ExecuteBody | null;
  const agent = AGENTS.find((item) => item.id === body?.agentId);
  const prompt = body?.prompt?.trim();
  const files = Array.isArray(body?.files) ? body.files : [];
  if (!agent || !prompt || prompt.length > 20_000)
    return json(
      "A valid agent and prompt (up to 20,000 characters) are required.",
      400,
      session,
    );
  if (files.length > 40)
    return json("Upload up to 40 CSV or JSON files.", 400, session);
  if (
    files.some(
      (file) =>
        !file ||
        typeof file.name !== "string" ||
        typeof file.content !== "string" ||
        !/\.(csv|json)$/i.test(file.name) ||
        file.content.length > 2_000_000,
    )
  ) {
    return json(
      "Only CSV or JSON files up to 2 MB each are accepted.",
      400,
      session,
    );
  }
  if (files.reduce((sum, file) => sum + file.content.length, 0) > 20_000_000)
    return json("Combined upload limit is 20 MB.", 400, session);

  const names = new Set<string>();
  const safeFiles = files.map((file) => {
    const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
    if (
      !safeName ||
      safeName === "." ||
      safeName === ".." ||
      names.has(safeName)
    )
      return null;
    names.add(safeName);
    return { name: safeName, content: file.content };
  });
  if (safeFiles.some((file) => file === null))
    return json("File names must be unique and valid.", 400, session);

  const quickBooksCounts = Array.isArray(body?.quickBooksCounts)
    ? body.quickBooksCounts
        .filter(
          (item): item is string =>
            typeof item === "string" && item.length <= 120,
        )
        .slice(0, 20)
    : [];

  const quickBooksConnection = await getPrimaryConnection(session.hash);
  const agentPermissions = await getAgentPermissions(session.hash);
  const mcp: AgentMcpConfig | null =
    quickBooksConnection?.is_connected && agentPermissions.length
      ? {
          sessionHash: session.hash,
          origin: getRequestOrigin(request),
          permissions: agentPermissions,
        }
      : null;

  const sessionKey = (body?.sessionId || randomUUID())
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
  const root = await mkdtemp(
    path.join(os.tmpdir(), `${AGENT_TEMP_PREFIX}agent-${sessionKey}-`),
  );
  const workspace = path.join(root, randomUUID());
  await mkdir(workspace, { mode: 0o700 });
  try {
    for (const file of safeFiles) {
      if (file)
        await writeFile(path.join(workspace, file.name), file.content, {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx",
        });
    }
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      const abort = new AbortController();
      request.signal.addEventListener("abort", () => abort.abort(), {
        once: true,
      });
      try {
        send("status", { status: "running" });

        const usage = await runClaudeAgent({
          agent,
          prompt,
          workspace,
          inputNames: names,
          quickBooksCounts,
          mcp,
          signal: abort.signal,
          onMessage: (text) => send("message", { text }),
          onPendingOperation: (operation) =>
            send("pending_operation", operation),
          onActivity: (tool, status) =>
            send("activity", { type: "tool", tool, status }),
          onFileChange: (filePath) =>
            send("file_change", {
              changes: [{ kind: "write", path: filePath }],
              status: "completed",
            }),
          credentials,
        });

        if (abort.signal.aborted) return;

        send("collecting", { status: "running" });
        const outputFiles: { name: string; content: string }[] = [];
        const collect = async (directory: string, prefix = "") => {
          for (const entry of await readdir(directory, {
            withFileTypes: true,
          })) {
            if (entry.isSymbolicLink()) continue;
            const relative = path.posix.join(prefix, entry.name);
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) await collect(full, relative);
            else if (!names.has(entry.name) && outputFiles.length < 50) {
              const content = await readFile(full, "utf8").catch(() => "");
              if (content.length <= 1_000_000)
                outputFiles.push({ name: relative, content });
            }
          }
        };
        await collect(workspace);
        send("complete", { usage, files: outputFiles });
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error("Claude agent execution failed", error);
          const detail =
            error instanceof Error ? error.message.trim().slice(0, 1_000) : "";
          send("error", {
            message: detail
              ? `Agent execution failed: ${detail}`
              : "Agent execution failed. Check the server Claude credentials and model, then see the server logs for details.",
          });
        }
      } finally {
        await rm(root, { recursive: true, force: true }).catch((error) =>
          console.error("Workspace cleanup failed", error),
        );
        controller.close();
      }
    },
    cancel() {
      // The request signal aborts the Claude API call when the client disconnects.
    },
  });

  const response = new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
  if (session.needsCookie) {
    response.headers.append(
      "set-cookie",
      sessionCookieHeader(session.raw, session.secure),
    );
  }
  return response;
}

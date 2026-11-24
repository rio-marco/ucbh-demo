import { randomUUID } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpError } from "@/lib/mcp/config";
import { saveMcpNonce } from "@/lib/mcp/db";
import { createMcpToken } from "@/lib/mcp/security";
import { getRuntimeEnv } from "@/lib/runtime-env";

const MCP_PROTOCOL_VERSION = "2025-06-18";

function serverUrl(origin: string): string {
  const configured = getRuntimeEnv("MCP_SERVER_URL").trim();
  const base = configured || `${origin}/api/mcp`;
  return base.replace(/\/+$/, "");
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();

  if (contentType.includes("text/event-stream")) {
    const dataLine = raw
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("data:"));
    if (!dataLine) throw new McpError("mcp_unavailable", "MCP returned an empty stream.");
    return JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new McpError(
      "mcp_unavailable",
      `MCP returned an invalid response (${response.status}).`,
    );
  }
}

async function rpc(
  origin: string,
  sessionHash: string,
  method: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const signed = createMcpToken(sessionHash);
  await saveMcpNonce({
    nonce: signed.nonce,
    sessionHash,
    expiresAt: signed.expiresAt,
  });

  let response: Response;
  try {
    response = await fetch(serverUrl(origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${signed.token}`,
        "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: randomUUID(),
        method,
        params,
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError("mcp_unavailable");
  }

  const payload = await readResponse(response);
  if (!response.ok || payload.error) {
    const detail =
      payload.error && typeof payload.error === "object"
        ? String(
            (payload.error as { message?: unknown }).message ||
              "MCP request failed.",
          )
        : `MCP request failed (${response.status}).`;
    throw new McpError("mcp_unavailable", detail);
  }
  return (payload.result ?? {}) as Record<string, unknown>;
}

export async function initializeMcpSession(
  origin: string,
  sessionHash: string,
): Promise<void> {
  await rpc(origin, sessionHash, "initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "ucbh-web-client", version: "1.0.0" },
  });
}

export async function listMcpTools(
  origin: string,
  sessionHash: string,
): Promise<{ name: string; description?: string; inputSchema?: Record<string, unknown> }[]> {
  const result = await rpc(origin, sessionHash, "tools/list", {});
  return Array.isArray(result.tools)
    ? (result.tools as {
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      }[])
    : [];
}

export async function callMcpTool(
  origin: string,
  sessionHash: string,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const result = await rpc(origin, sessionHash, "tools/call", {
    name,
    arguments: args,
  });
  return result as unknown as CallToolResult;
}

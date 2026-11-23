import { hasAgentPermission, type AgentPermission } from "@/lib/agent-permissions";
import { callMcpTool, initializeMcpSession, listMcpTools } from "@/lib/mcp/client";
import { claudeToolSchemas, VISIBLE_MCP_TOOLS } from "@/lib/mcp/tools";

const TOOL_PREFIX = "mcp__quickbooks__";

const TOOL_PERMISSIONS: Record<string, AgentPermission> = {
  qb_get_company_info: "read",
  qb_query: "read",
  qb_find_records: "read",
  qb_propose_update: "update",
};

const visibleTools = new Set<string>(VISIBLE_MCP_TOOLS);

export type AgentMcpConfig = {
  sessionHash: string;
  origin: string;
  permissions: AgentPermission[];
};

export type AgentMcpPendingOperation = {
  confirmationId: string;
  confirmationSecret: string;
  entity: string;
  recordId: string;
  fields: Record<string, unknown>;
};

export type AgentMcpToolCallResult = {
  content: string;
  isError: boolean;
  pending?: AgentMcpPendingOperation;
};

type RemoteTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

function canUse(toolName: string, permissions: AgentPermission[]): boolean {
  const permission = TOOL_PERMISSIONS[toolName];
  return Boolean(
    visibleTools.has(toolName) &&
      permission &&
      hasAgentPermission(permissions, permission),
  );
}

export function isAgentMcpToolName(name: string): boolean {
  return name.startsWith(TOOL_PREFIX);
}

export function agentMcpToolName(name: string): string | null {
  return name.startsWith(TOOL_PREFIX) ? name.slice(TOOL_PREFIX.length) : null;
}

export async function getAgentMcpTools(
  config: AgentMcpConfig,
): Promise<Record<string, unknown>[]> {
  if (
    !hasAgentPermission(config.permissions, "read") &&
    !hasAgentPermission(config.permissions, "update")
  ) {
    return [];
  }

  await initializeMcpSession(config.origin, config.sessionHash);
  const remoteTools = await listMcpTools(config.origin, config.sessionHash);
  const schemas: RemoteTool[] = remoteTools.length
    ? remoteTools
    : claudeToolSchemas();

  return schemas
    .map((tool) => {
      const name = agentMcpToolName(tool.name) ?? tool.name;
      return { name, tool };
    })
    .filter(({ name }) => canUse(name, config.permissions))
    .map(({ name, tool }) => ({
      name: `${TOOL_PREFIX}${name}`,
      description:
        tool.description || `Call the QuickBooks tool ${name}.`,
      input_schema: tool.inputSchema ?? { type: "object", properties: {} },
    }));
}

function toolText(result: {
  content?: { type?: string; text?: string }[];
}): string {
  return (result.content ?? [])
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n");
}

function parseToolPayload(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function callAgentMcpTool(
  config: AgentMcpConfig,
  toolName: string,
  input: Record<string, unknown>,
): Promise<AgentMcpToolCallResult> {
  const name = agentMcpToolName(toolName) ?? toolName;
  if (!canUse(name, config.permissions)) {
    return {
      content: `QuickBooks tool ${name} is not allowed by the granted permissions.`,
      isError: true,
    };
  }

  const result = await callMcpTool(
    config.origin,
    config.sessionHash,
    name,
    input || {},
  );
  const rawText = toolText(result);
  const payload = parseToolPayload(rawText);
  let sanitized = payload;
  let pending: AgentMcpPendingOperation | undefined;

  if (
    payload &&
    payload.requiresConfirmation === true &&
    typeof payload.confirmation_id === "string" &&
    typeof payload.confirmation_secret === "string"
  ) {
    const summary =
      payload.summary && typeof payload.summary === "object"
        ? (payload.summary as Record<string, unknown>)
        : {};
    pending = {
      confirmationId: payload.confirmation_id,
      confirmationSecret: payload.confirmation_secret,
      entity: String(summary.entity ?? "QuickBooks record"),
      recordId: String(summary.recordId ?? ""),
      fields:
        summary.fields && typeof summary.fields === "object"
          ? (summary.fields as Record<string, unknown>)
          : {},
    };
    sanitized = { ...payload };
    delete sanitized.confirmation_secret;
  }

  return {
    content: JSON.stringify(sanitized ?? { text: rawText }),
    isError: Boolean(result.isError),
    pending,
  };
}

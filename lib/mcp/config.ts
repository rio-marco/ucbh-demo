export type McpErrorCode =
  | "not_connected"
  | "session_expired"
  | "oauth_failed"
  | "oauth_cancelled"
  | "invalid_state"
  | "token_refresh_failed"
  | "quickbooks_api_error"
  | "missing_permissions"
  | "no_records"
  | "mcp_unavailable"
  | "claude_error"
  | "config_error"
  | "confirmation_required"
  | "confirmation_invalid"
  | "writes_disabled";

const MESSAGES: Record<McpErrorCode, string> = {
  not_connected:
    "QuickBooks is not connected for this browser. Connect your company to use the MCP Connector.",
  session_expired:
    "Your session expired. Refresh the page and connect QuickBooks again.",
  oauth_failed:
    "QuickBooks could not complete the connection. Please try again.",
  oauth_cancelled: "You cancelled the QuickBooks authorization.",
  invalid_state:
    "The QuickBooks sign-in session expired. Please try again.",
  token_refresh_failed:
    "Your QuickBooks connection could not be renewed. Reconnect your account.",
  quickbooks_api_error: "QuickBooks could not complete that request.",
  missing_permissions:
    "This QuickBooks connection is missing the required accounting permissions.",
  no_records: "No matching QuickBooks records were found.",
  mcp_unavailable: "The MCP server is unavailable. Please try again shortly.",
  claude_error: "Claude could not complete the request. Please try again.",
  config_error: "The MCP Connector is not configured on this server.",
  confirmation_required: "This change needs your confirmation before it runs.",
  confirmation_invalid:
    "This confirmation is invalid or has expired. Ask Claude again.",
  writes_disabled: "QuickBooks writes are disabled on this server.",
};

export class McpError extends Error {
  readonly code: McpErrorCode;
  readonly detail?: string;

  constructor(code: McpErrorCode, detail?: string) {
    super(MESSAGES[code]);
    this.name = "McpError";
    this.code = code;
    this.detail = detail;
  }
}

export function mcpMessage(code: McpErrorCode, detail?: string): string {
  if (!detail) return MESSAGES[code];
  const clean = detail.replace(/\s+/g, " ").trim().slice(0, 300);
  return `${MESSAGES[code]} ${clean}`;
}

export function mcpErrorCode(error: unknown): McpErrorCode {
  if (error instanceof McpError) return error.code;
  return "mcp_unavailable";
}

export function mcpErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (error instanceof McpError) return error.message;
    if (/unauthorized|forbidden|401|403/i.test(error.message)) {
      return mcpMessage("missing_permissions", error.message);
    }
    if (/refresh/i.test(error.message)) {
      return mcpMessage("token_refresh_failed", error.message);
    }
    return mcpMessage("quickbooks_api_error", error.message);
  }
  return mcpMessage("mcp_unavailable");
}

export function mcpConfig() {
  return {
    serverUrl: process.env.MCP_SERVER_URL || "",
    allowWrites: process.env.MCP_ALLOW_WRITES === "true",
    sessionTtlSeconds: 30 * 24 * 60 * 60,
    oauthStateTtlSeconds: 10 * 60,
    mcpTokenTtlSeconds: 5 * 60,
    pendingTtlSeconds: 15 * 60,
  };
}

export function assertMcpSecretsConfigured(): void {
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY || "";
  const signingSecret = process.env.MCP_SIGNING_SECRET || "";

  if (!encryptionKey || !signingSecret || signingSecret.length < 32) {
    throw new McpError("config_error");
  }
}

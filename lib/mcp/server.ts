import { randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { mcpConfig, mcpErrorCode, mcpErrorMessage, McpError } from "@/lib/mcp/config";
import {
  appendAuditLog,
  consumePendingOperation,
  createPendingOperation,
  getPrimaryConnection,
  isOperationId,
  type QuickBooksConnectionDoc,
} from "@/lib/mcp/db";
import {
  ensureWritesAllowed,
  getCompanyName,
  qbGet,
  qbUpdate,
} from "@/lib/mcp/quickbooks";
import { hashValue } from "@/lib/mcp/security";
import {
  buildFindQuery,
  MCP_TOOL_DEFINITIONS,
  validateReadOnlyQuery,
  type McpToolName,
} from "@/lib/mcp/tools";
import { parseQuickBooksUpdates } from "@/lib/quickbooks-entities";

function textResult(value: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function errorResult(error: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: mcpErrorMessage(error) }],
    isError: true,
  };
}

export function createMcpServer(sessionHash: string): McpServer {
  const server = new McpServer({
    name: "ucbh-quickbooks-mcp",
    version: "1.0.0",
  });

  const run = async (
    name: McpToolName,
    handler: (context: {
      realmId: () => string | null;
      connection: () => Promise<QuickBooksConnectionDoc>;
    }) => Promise<Record<string, unknown>>,
  ): Promise<CallToolResult> => {
    const started = Date.now();
    let realmId: string | null = null;
    try {
      const result = await handler({
        realmId: () => realmId,
        connection: async () => {
          const connection = await getPrimaryConnection(sessionHash);
          if (!connection || !connection.is_connected) {
            throw new McpError("not_connected");
          }
          realmId = connection.realm_id;
          return connection;
        },
      });
      await appendAuditLog({
        sessionHash,
        realmId,
        event: name,
        ok: true,
        durationMs: Date.now() - started,
      });
      return textResult(result);
    } catch (error) {
      await appendAuditLog({
        sessionHash,
        realmId,
        event: name,
        ok: false,
        errorCode: mcpErrorCode(error),
        durationMs: Date.now() - started,
      });
      return errorResult(error);
    }
  };

  const register = (name: McpToolName) => {
    const definition = MCP_TOOL_DEFINITIONS[name];
    server.registerTool(
      name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.schema,
      },
      async (args) => {
        const input = definition.schema.parse(args) as Record<string, unknown>;
        return run(name, async ({ connection }) => {
          if (name === "qb_get_company_info") {
            const active = await connection();
            return {
              companyName: await getCompanyName(sessionHash, active),
              environment: active.environment,
            };
          }

          if (name === "qb_query") {
            const active = await connection();
            const maxResults = Math.min(1000, Number(input.max_results) || 100);
            const validated = validateReadOnlyQuery(String(input.query), maxResults);
            const data = await qbGet<{
              QueryResponse?: Record<string, unknown[]>;
            }>(
              sessionHash,
              active,
              `query?query=${encodeURIComponent(validated.query)}`,
            );
            const records = data.QueryResponse?.[validated.entity] ?? [];
            return {
              entity: validated.entity,
              count: records.length,
              records: records.slice(0, maxResults),
            };
          }

          if (name === "qb_find_records") {
            const active = await connection();
            const maxResults = Math.min(100, Number(input.max_results) || 20);
            const query = buildFindQuery(
              String(input.entity),
              String(input.search_term),
              maxResults,
            );
            const entity = String(input.entity);
            const data = await qbGet<{
              QueryResponse?: Record<string, unknown[]>;
            }>(
              sessionHash,
              active,
              `query?query=${encodeURIComponent(query)}`,
            );
            const records = data.QueryResponse?.[entity] ?? [];
            return { entity, count: records.length, records };
          }

          if (name === "qb_propose_update") {
            const active = await connection();
            const parsed = parseQuickBooksUpdates([
              {
                entity: input.entity,
                id: input.record_id,
                syncToken: input.sync_token,
                fields: input.fields,
              },
            ]);
            if (!parsed.operations?.length) {
              throw new McpError(
                "quickbooks_api_error",
                parsed.error || "Invalid update proposal.",
              );
            }
            const operation = parsed.operations[0];
            const secret = randomBytes(24).toString("base64url");
            const confirmationId = await createPendingOperation({
              sessionHash,
              realmId: active.realm_id,
              entity: operation.entity,
              recordId: operation.id,
              syncToken: operation.syncToken,
              fields: operation.fields,
              confirmationSecretHash: hashValue(secret),
              ttlSeconds: mcpConfig().pendingTtlSeconds,
            });
            return {
              requiresConfirmation: true,
              confirmation_id: confirmationId,
              confirmation_secret: secret,
              summary: {
                entity: operation.entity,
                recordId: operation.id,
                fields: operation.fields,
              },
              message:
                "The update is prepared but not applied. Ask the user to confirm it before proceeding.",
            };
          }

          if (name === "qb_apply_update") {
            const active = await connection();
            ensureWritesAllowed(active.environment);
            const id = String(input.confirmation_id);
            const secret = String(input.confirmation_secret);
            if (!isOperationId(id)) throw new McpError("confirmation_invalid");
            const operation = await consumePendingOperation(
              id,
              hashValue(secret),
              sessionHash,
            );
            if (!operation || operation.realm_id !== active.realm_id) {
              throw new McpError("confirmation_invalid");
            }
            const data = await qbUpdate(
              sessionHash,
              active,
              operation.entity,
              {
                ...operation.fields,
                Id: operation.record_id,
                SyncToken: operation.sync_token,
                sparse: true,
              },
            );
            return {
              ok: true,
              entity: operation.entity,
              recordId: operation.record_id,
              result: data,
            };
          }

          throw new McpError("mcp_unavailable", "Unknown tool.");
        });
      },
    );
  };

  (Object.keys(MCP_TOOL_DEFINITIONS) as McpToolName[]).forEach(register);
  return server;
}

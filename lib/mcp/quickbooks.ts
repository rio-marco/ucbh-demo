import { randomUUID } from "node:crypto";
import {
  INTUIT_TOKEN_URL,
  getQBConfig,
  loadTokens,
} from "@/lib/quickbooks";
import { mcpConfig, McpError } from "@/lib/mcp/config";
import {
  acquireRefreshLock,
  getConnection,
  markConnectionDisconnected,
  releaseRefreshLock,
  saveQuickBooksConnection,
  updateConnectionTokens,
  type QuickBooksConnectionDoc,
} from "@/lib/mcp/db";
import {
  decryptCredential,
  encryptCredential,
} from "@/lib/mcp/security";

const QB_API_BASE: Record<"sandbox" | "production", string> = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
};

function errorFromBody(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      Fault?: { Error?: { Message?: string; Detail?: string }[] };
    };
    const errors = parsed.Fault?.Error;
    if (Array.isArray(errors) && errors.length) {
      return errors
        .map((item) => [item.Message, item.Detail].filter(Boolean).join(": "))
        .filter(Boolean)
        .join("; ");
    }
  } catch {
    void 0;
  }
  const text = body.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 300) : `QuickBooks returned status ${status}.`;
}

function apiBase(connection: QuickBooksConnectionDoc): string {
  return QB_API_BASE[connection.environment] || QB_API_BASE.sandbox;
}

export async function importExistingQuickBooksConnection(
  sessionHash: string,
): Promise<QuickBooksConnectionDoc | null> {
  const tokens = await loadTokens();
  if (!tokens?.access_token || !tokens?.refresh_token || !tokens?.realm_id) {
    return null;
  }
  const existing = await getConnection(sessionHash, tokens.realm_id);
  if (existing?.is_connected) return existing;
  const createdMs = new Date(tokens.created_at).getTime();
  if (!Number.isFinite(createdMs)) return null;

  return saveQuickBooksConnection({
    sessionHash,
    realmId: tokens.realm_id,
    companyName: "QuickBooks company",
    environment: getQBConfig().environment,
    accessToken: encryptCredential(tokens.access_token, sessionHash, tokens.realm_id),
    refreshToken: encryptCredential(tokens.refresh_token, sessionHash, tokens.realm_id),
    accessTokenExpiresAt: new Date(createdMs + tokens.expires_in * 1000),
    refreshTokenExpiresAt: new Date(
      createdMs + tokens.x_refresh_token_expires_in * 1000,
    ),
  });
}

export function accessTokenExpiring(connection: QuickBooksConnectionDoc): boolean {
  return (
    connection.access_token_expires_at.getTime() - Date.now() < 5 * 60 * 1000
  );
}

async function refreshConnectionTokens(
  sessionHash: string,
  connection: QuickBooksConnectionDoc,
  force: boolean,
): Promise<QuickBooksConnectionDoc> {
  let current = await getConnection(sessionHash, connection.realm_id);
  if (!current || !current.is_connected || !current.refresh_token) {
    throw new McpError("not_connected");
  }
  if (!force && !accessTokenExpiring(current)) return current;

  if (current.refresh_token_expires_at.getTime() <= Date.now()) {
    await markConnectionDisconnected(current.id, "refresh_expired");
    throw new McpError("token_refresh_failed");
  }

  const lockId = randomUUID();
  let acquired = await acquireRefreshLock(current.id, lockId);
  for (let attempt = 0; !acquired && attempt < 25; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const latest = await getConnection(sessionHash, connection.realm_id);
    if (!latest || !latest.is_connected) throw new McpError("not_connected");
    if (!accessTokenExpiring(latest) && !force) return latest;
    acquired = await acquireRefreshLock(latest.id, lockId);
    current = latest;
  }
  if (!acquired) throw new McpError("token_refresh_failed");

  try {
    const latest = await getConnection(sessionHash, connection.realm_id);
    if (!latest?.refresh_token) throw new McpError("not_connected");
    if (!force && !accessTokenExpiring(latest)) {
      await releaseRefreshLock(latest.id, lockId);
      return latest;
    }

    const refreshToken = decryptCredential(
      latest.refresh_token,
      sessionHash,
      latest.realm_id,
    );
    const { clientId, clientSecret } = getQBConfig();
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch(INTUIT_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("QuickBooks MCP refresh failed:", body.slice(0, 200));
      if (/invalid_grant|invalid_refresh|revoked/i.test(body)) {
        await markConnectionDisconnected(latest.id, "refresh_revoked");
        throw new McpError("not_connected");
      }
      throw new McpError("token_refresh_failed");
    }

    const data = (await response.json()) as Record<string, unknown>;
    const now = Date.now();
    const accessExpiresMs = Number(data.expires_in) || 3600;
    const refreshExpiresMs = Number(data.x_refresh_token_expires_in) || 8_726_400;
    const nextAccess = String(data.access_token || "");
    const nextRefresh = String(data.refresh_token || refreshToken);
    if (!nextAccess) throw new McpError("token_refresh_failed");

    await updateConnectionTokens(latest.id, {
      accessToken: encryptCredential(nextAccess, sessionHash, latest.realm_id),
      refreshToken: encryptCredential(nextRefresh, sessionHash, latest.realm_id),
      accessTokenExpiresAt: new Date(now + accessExpiresMs * 1000),
      refreshTokenExpiresAt: new Date(now + refreshExpiresMs * 1000),
      lockId,
    });

    const updated = await getConnection(sessionHash, latest.realm_id);
    if (!updated) throw new McpError("not_connected");
    return updated;
  } catch (error) {
    const latest = await getConnection(sessionHash, connection.realm_id);
    if (latest) await releaseRefreshLock(latest.id, lockId);
    throw error;
  }
}

async function accessTokenFor(
  sessionHash: string,
  connection: QuickBooksConnectionDoc,
  force = false,
): Promise<{ token: string; connection: QuickBooksConnectionDoc }> {
  let current = connection;
  if (!current.is_connected || !current.access_token) {
    throw new McpError("not_connected");
  }
  if (force || accessTokenExpiring(current)) {
    current = await refreshConnectionTokens(sessionHash, current, force);
  }
  return {
    token: decryptCredential(current.access_token, sessionHash, current.realm_id),
    connection: current,
  };
}

export async function qbGet<T = Record<string, unknown>>(
  sessionHash: string,
  connection: QuickBooksConnectionDoc,
  endpoint: string,
): Promise<T> {
  let credentials = await accessTokenFor(sessionHash, connection);
  let response: Response;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await fetch(
      `${apiBase(credentials.connection)}/v3/company/${credentials.connection.realm_id}/${endpoint}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${credentials.token}`,
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (response.ok) break;
    const body = await response.text();
    if (response.status === 401 && attempt === 0) {
      credentials = await accessTokenFor(sessionHash, credentials.connection, true);
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      throw new McpError("missing_permissions", errorFromBody(response.status, body));
    }
    if (response.status === 429) {
      throw new McpError("quickbooks_api_error", "QuickBooks is rate limiting requests.");
    }
    throw new McpError("quickbooks_api_error", errorFromBody(response.status, body));
  }

  if (!response!.ok) throw new McpError("quickbooks_api_error");
  try {
    return (await response!.json()) as T;
  } catch {
    throw new McpError("quickbooks_api_error", "QuickBooks returned an invalid response.");
  }
}

export async function qbUpdate<T = Record<string, unknown>>(
  sessionHash: string,
  connection: QuickBooksConnectionDoc,
  entity: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const credentials = await accessTokenFor(sessionHash, connection);
  const response = await fetch(
    `${apiBase(credentials.connection)}/v3/company/${credentials.connection.realm_id}/${encodeURIComponent(entity)}?operation=update`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${credentials.token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new McpError("missing_permissions", errorFromBody(response.status, body));
    }
    throw new McpError("quickbooks_api_error", errorFromBody(response.status, body));
  }
  try {
    const data = JSON.parse(body) as T;
    if (
      data &&
      typeof data === "object" &&
      "Fault" in (data as Record<string, unknown>)
    ) {
      throw new McpError("quickbooks_api_error", errorFromBody(response.status, body));
    }
    return data;
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError("quickbooks_api_error", "QuickBooks returned an invalid response.");
  }
}

export async function getCompanyName(
  sessionHash: string,
  connection: QuickBooksConnectionDoc,
): Promise<string> {
  try {
    const data = await qbGet<{ CompanyInfo?: { CompanyName?: string } }>(
      sessionHash,
      connection,
      `companyinfo/${connection.realm_id}`,
    );
    return data.CompanyInfo?.CompanyName || "QuickBooks company";
  } catch {
    return connection.company_name || "QuickBooks company";
  }
}

export function ensureWritesAllowed(
  environment: "sandbox" | "production",
): void {
  if (!mcpConfig().allowWrites) throw new McpError("writes_disabled");
  if (
    environment === "production" &&
    process.env.QB_ALLOW_PRODUCTION_WRITES !== "true"
  ) {
    throw new McpError("writes_disabled", "Production writes require QB_ALLOW_PRODUCTION_WRITES=true.");
  }
}

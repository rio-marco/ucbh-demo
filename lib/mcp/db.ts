import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  normalizeAgentPermissions,
  type AgentPermission,
} from "@/lib/agent-permissions";
import {
  decryptCredential,
  encryptCredential,
  type EncryptedCredential,
} from "@/lib/mcp/security";

export type BrowserSessionDoc = {
  id: string;
  session_id: string;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
};

export type OAuthStateDoc = {
  id: string;
  state_hash: string;
  session_id: string;
  return_to: string;
  redirect_uri?: string;
  created_at: Date;
  expires_at: Date;
};

export type McpNonceDoc = {
  id: string;
  nonce: string;
  session_id: string;
  created_at: Date;
  expires_at: Date;
};

export type ConnectionOrigin = "oauth" | "import";

export type QuickBooksConnectionDoc = {
  id: string;
  session_id: string;
  realm_id: string;
  company_name: string;
  access_token: EncryptedCredential | null;
  refresh_token: EncryptedCredential | null;
  access_token_expires_at: Date;
  refresh_token_expires_at: Date;
  environment: "sandbox" | "production";
  origin: ConnectionOrigin;
  is_connected: boolean;
  is_primary: boolean;
  refresh_lock_id: string | null;
  refresh_lock_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PendingOperationDoc = {
  id: string;
  session_id: string;
  realm_id: string;
  entity: string;
  record_id: string;
  sync_token: string;
  fields: Record<string, unknown>;
  confirmation_secret_hash: string;
  status: "pending" | "cancelled" | "applied";
  created_at: Date;
  expires_at: Date;
};

export type AuditDoc = {
  id: string;
  session_id: string;
  realm_id: string | null;
  event: string;
  ok: boolean;
  error_code: string | null;
  duration_ms: number;
  confirmation_id: string | null;
  created_at: Date;
};

export type ClaudeAuthDoc = {
  id: string;
  session_id: string;
  user_id: string;
  email: string | null;
  mode: "oauth";
  connection_id: string | null;
  access_token: EncryptedCredential | null;
  refresh_token: EncryptedCredential | null;
  scopes: string[];
  access_token_expires_at: Date | null;
  refresh_token_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ClaudeStateDoc = {
  id: string;
  state_hash: string;
  code_verifier: EncryptedCredential;
  session_id: string;
  return_to: string;
  redirect_uri: string;
  user_profile_id: string;
  created_at: Date;
  expires_at: Date;
};

export type AgentPermissionDoc = {
  id: string;
  session_id: string;
  scopes: AgentPermission[];
  created_at: Date;
  updated_at: Date;
};

type Store = {
  sessions: BrowserSessionDoc[];
  states: OAuthStateDoc[];
  tokens: McpNonceDoc[];
  connections: QuickBooksConnectionDoc[];
  pending: PendingOperationDoc[];
  audit: AuditDoc[];
  claudeAuth: ClaudeAuthDoc[];
  claudeStates: ClaudeStateDoc[];
  permissions: AgentPermissionDoc[];
};

declare global {
  var __ucbhMcpStoreQueue: Promise<void> | undefined;
}

export function newId(): string {
  return randomBytes(16).toString("hex");
}

export function isOperationId(value: string): boolean {
  return /^[a-f0-9]{32}$/.test(value);
}

function storePath(): string {
  return join(process.cwd(), ".data", "mcp-store.json");
}

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function prune(store: Store): void {
  const now = Date.now();
  store.sessions = store.sessions.filter(
    (item) => item.expires_at.getTime() > now,
  );
  store.states = store.states.filter((item) => item.expires_at.getTime() > now);
  store.tokens = store.tokens.filter((item) => item.expires_at.getTime() > now);
  store.pending = store.pending.filter(
    (item) => item.expires_at.getTime() > now,
  );
  store.claudeStates = store.claudeStates.filter(
    (item) => item.expires_at.getTime() > now,
  );
  const activeSessions = new Set(store.sessions.map((item) => item.session_id));
  store.permissions = store.permissions.filter((item) =>
    activeSessions.has(item.session_id),
  );
  store.audit = store.audit
    .filter(
      (item) => now - item.created_at.getTime() < 90 * 24 * 60 * 60 * 1000,
    )
    .slice(-2000);
}

async function readStore(): Promise<Store> {
  let raw: string;
  try {
    raw = await readFile(storePath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        sessions: [],
        states: [],
        tokens: [],
        connections: [],
        pending: [],
        audit: [],
        claudeAuth: [],
        claudeStates: [],
        permissions: [],
      };
    }
    throw error;
  }
  const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>[]>;
  const store: Store = {
    sessions: (parsed.sessions || []).map((item) => ({
      ...(item as unknown as Omit<
        BrowserSessionDoc,
        "created_at" | "updated_at" | "expires_at"
      >),
      created_at: asDate(item.created_at),
      updated_at: asDate(item.updated_at),
      expires_at: asDate(item.expires_at),
    })),
    states: (parsed.states || []).map((item) => ({
      ...(item as unknown as Omit<OAuthStateDoc, "created_at" | "expires_at">),
      created_at: asDate(item.created_at),
      expires_at: asDate(item.expires_at),
    })),
    tokens: (parsed.tokens || []).map((item) => ({
      ...(item as unknown as Omit<McpNonceDoc, "created_at" | "expires_at">),
      created_at: asDate(item.created_at),
      expires_at: asDate(item.expires_at),
    })),
    connections: (parsed.connections || []).map((item) => ({
      ...(item as unknown as Omit<
        QuickBooksConnectionDoc,
        | "access_token_expires_at"
        | "refresh_token_expires_at"
        | "refresh_lock_at"
        | "created_at"
        | "updated_at"
      >),
      access_token_expires_at: asDate(item.access_token_expires_at),
      refresh_token_expires_at: asDate(item.refresh_token_expires_at),
      refresh_lock_at: item.refresh_lock_at
        ? asDate(item.refresh_lock_at)
        : null,
      created_at: asDate(item.created_at),
      updated_at: asDate(item.updated_at),
    })),
    pending: (parsed.pending || []).map((item) => ({
      ...(item as unknown as Omit<
        PendingOperationDoc,
        "created_at" | "expires_at"
      >),
      created_at: asDate(item.created_at),
      expires_at: asDate(item.expires_at),
    })),
    audit: (parsed.audit || []).map((item) => ({
      ...(item as unknown as Omit<AuditDoc, "created_at">),
      created_at: asDate(item.created_at),
    })),
    claudeAuth: (parsed.claudeAuth || []).map((item) => ({
      ...(item as unknown as Omit<
        ClaudeAuthDoc,
        | "access_token_expires_at"
        | "refresh_token_expires_at"
        | "created_at"
        | "updated_at"
      >),
      access_token_expires_at: item.access_token_expires_at
        ? asDate(item.access_token_expires_at)
        : null,
      refresh_token_expires_at: item.refresh_token_expires_at
        ? asDate(item.refresh_token_expires_at)
        : null,
      created_at: asDate(item.created_at),
      updated_at: asDate(item.updated_at),
    })),
    claudeStates: (parsed.claudeStates || []).map((item) => ({
      ...(item as unknown as Omit<ClaudeStateDoc, "created_at" | "expires_at">),
      created_at: asDate(item.created_at),
      expires_at: asDate(item.expires_at),
    })),
    permissions: (parsed.permissions || []).map((item) => ({
      ...(item as unknown as Omit<
        AgentPermissionDoc,
        "scopes" | "created_at" | "updated_at"
      >),
      scopes: normalizeAgentPermissions(item.scopes),
      created_at: asDate(item.created_at),
      updated_at: asDate(item.updated_at),
    })),
  };
  prune(store);
  return store;
}

async function writeStore(store: Store): Promise<void> {
  const file = storePath();
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
  await rename(temp, file);
}

async function withStore<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
  const previous = (globalThis.__ucbhMcpStoreQueue ??= Promise.resolve());
  const run = previous.then(async () => {
    const store = await readStore();
    const result = await fn(store);
    await writeStore(store);
    return result;
  });
  globalThis.__ucbhMcpStoreQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function getBrowserSession(
  sessionHash: string,
): Promise<BrowserSessionDoc | null> {
  return withStore(
    (store) =>
      store.sessions.find((item) => item.session_id === sessionHash) ?? null,
  );
}

export async function createBrowserSession(
  sessionHash: string,
  ttlSeconds: number,
): Promise<BrowserSessionDoc> {
  return withStore((store) => {
    const now = new Date();
    let record = store.sessions.find((item) => item.session_id === sessionHash);
    if (!record) {
      record = {
        id: newId(),
        session_id: sessionHash,
        created_at: now,
        updated_at: now,
        expires_at: new Date(now.getTime() + ttlSeconds * 1000),
      };
      store.sessions.push(record);
      return record;
    }
    record.updated_at = now;
    record.expires_at = new Date(now.getTime() + ttlSeconds * 1000);
    return record;
  });
}

export async function touchBrowserSession(
  sessionHash: string,
  ttlSeconds: number,
): Promise<void> {
  await withStore((store) => {
    const record = store.sessions.find(
      (item) => item.session_id === sessionHash,
    );
    if (!record) return;
    record.updated_at = new Date();
    record.expires_at = new Date(Date.now() + ttlSeconds * 1000);
  });
}

export async function createOAuthState(input: {
  stateHash: string;
  sessionHash: string;
  returnTo: string;
  redirectUri?: string;
  ttlSeconds: number;
}): Promise<void> {
  await withStore((store) => {
    store.states = store.states.filter(
      (item) => item.state_hash !== input.stateHash,
    );
    const now = new Date();
    store.states.push({
      id: newId(),
      state_hash: input.stateHash,
      session_id: input.sessionHash,
      return_to: input.returnTo,
      redirect_uri: input.redirectUri,
      created_at: now,
      expires_at: new Date(now.getTime() + input.ttlSeconds * 1000),
    });
  });
}

export async function consumeOAuthState(
  stateHash: string,
  sessionHash: string,
): Promise<OAuthStateDoc | null> {
  return withStore((store) => {
    const index = store.states.findIndex(
      (item) =>
        item.state_hash === stateHash &&
        item.session_id === sessionHash &&
        item.expires_at.getTime() > Date.now(),
    );
    if (index === -1) return null;
    return store.states.splice(index, 1)[0];
  });
}

export async function saveMcpNonce(input: {
  nonce: string;
  sessionHash: string;
  expiresAt: Date;
}): Promise<void> {
  await withStore((store) => {
    store.tokens.push({
      id: newId(),
      nonce: input.nonce,
      session_id: input.sessionHash,
      created_at: new Date(),
      expires_at: input.expiresAt,
    });
  });
}

export async function consumeMcpNonce(
  nonce: string,
  sessionHash: string,
): Promise<boolean> {
  return withStore((store) => {
    const index = store.tokens.findIndex(
      (item) =>
        item.nonce === nonce &&
        item.session_id === sessionHash &&
        item.expires_at.getTime() > Date.now(),
    );
    if (index === -1) return false;
    store.tokens.splice(index, 1);
    return true;
  });
}

export type ConnectionInput = {
  sessionHash: string;
  realmId: string;
  companyName: string;
  environment: "sandbox" | "production";
  accessToken: EncryptedCredential;
  refreshToken: EncryptedCredential;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  origin?: ConnectionOrigin;
};

export async function saveQuickBooksConnection(
  input: ConnectionInput,
): Promise<QuickBooksConnectionDoc> {
  return withStore((store) => {
    const now = new Date();
    let record = store.connections.find(
      (item) =>
        item.session_id === input.sessionHash &&
        item.realm_id === input.realmId,
    );
    if (!record) {
      record = {
        id: newId(),
        session_id: input.sessionHash,
        realm_id: input.realmId,
        company_name: input.companyName,
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
        access_token_expires_at: input.accessTokenExpiresAt,
        refresh_token_expires_at: input.refreshTokenExpiresAt,
        environment: input.environment,
        origin: input.origin ?? "import",
        is_connected: true,
        is_primary: false,
        refresh_lock_id: null,
        refresh_lock_at: null,
        created_at: now,
        updated_at: now,
      };
      store.connections.push(record);
    } else {
      record.company_name = input.companyName;
      record.environment = input.environment;
      record.origin = input.origin ?? record.origin ?? "import";
      record.access_token = input.accessToken;
      record.refresh_token = input.refreshToken;
      record.access_token_expires_at = input.accessTokenExpiresAt;
      record.refresh_token_expires_at = input.refreshTokenExpiresAt;
      record.is_connected = true;
      record.refresh_lock_id = null;
      record.refresh_lock_at = null;
      record.updated_at = now;
    }
    const existingPrimary = store.connections.some(
      (item) =>
        item.session_id === input.sessionHash &&
        item.is_primary &&
        item.is_connected &&
        item.id !== record!.id,
    );
    if (!existingPrimary) record.is_primary = true;
    return record;
  });
}

export async function getPrimaryConnection(
  sessionHash: string,
): Promise<QuickBooksConnectionDoc | null> {
  return withStore(
    (store) =>
      store.connections.find(
        (item) =>
          item.session_id === sessionHash &&
          item.is_connected &&
          item.is_primary &&
          item.origin === "oauth",
      ) ?? null,
  );
}

export async function getConnection(
  sessionHash: string,
  realmId: string,
): Promise<QuickBooksConnectionDoc | null> {
  return withStore(
    (store) =>
      store.connections.find(
        (item) => item.session_id === sessionHash && item.realm_id === realmId,
      ) ?? null,
  );
}

export async function listConnections(
  sessionHash: string,
): Promise<QuickBooksConnectionDoc[]> {
  return withStore((store) =>
    store.connections
      .filter((item) => item.session_id === sessionHash)
      .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
      .slice(0, 20),
  );
}

export async function setPrimaryConnection(
  sessionHash: string,
  realmId: string,
): Promise<boolean> {
  return withStore((store) => {
    const target = store.connections.find(
      (item) =>
        item.session_id === sessionHash &&
        item.realm_id === realmId &&
        item.is_connected,
    );
    if (!target) return false;
    for (const item of store.connections) {
      if (item.session_id === sessionHash)
        item.is_primary = item.id === target.id;
    }
    target.updated_at = new Date();
    return true;
  });
}

export async function disconnectConnection(
  sessionHash: string,
  realmId?: string,
): Promise<number> {
  return withStore((store) => {
    let changed = 0;
    for (const item of store.connections) {
      if (
        item.session_id !== sessionHash ||
        (realmId && item.realm_id !== realmId)
      ) {
        continue;
      }
      item.is_connected = false;
      item.is_primary = false;
      item.access_token = null;
      item.refresh_token = null;
      item.refresh_lock_id = null;
      item.refresh_lock_at = null;
      item.updated_at = new Date();
      changed += 1;
    }
    return changed;
  });
}

export async function updateConnectionTokens(
  id: string,
  input: {
    accessToken: EncryptedCredential;
    refreshToken: EncryptedCredential;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
    lockId: string;
  },
): Promise<void> {
  await withStore((store) => {
    const record = store.connections.find(
      (item) => item.id === id && item.refresh_lock_id === input.lockId,
    );
    if (!record) return;
    record.access_token = input.accessToken;
    record.refresh_token = input.refreshToken;
    record.access_token_expires_at = input.accessTokenExpiresAt;
    record.refresh_token_expires_at = input.refreshTokenExpiresAt;
    record.refresh_lock_id = null;
    record.refresh_lock_at = null;
    record.is_connected = true;
    record.updated_at = new Date();
  });
}

export async function markConnectionDisconnected(
  id: string,
  errorCode: string,
): Promise<void> {
  await withStore((store) => {
    const record = store.connections.find((item) => item.id === id);
    if (!record) return;
    record.is_connected = false;
    record.is_primary = false;
    record.access_token = null;
    record.refresh_token = null;
    record.refresh_lock_id = null;
    record.refresh_lock_at = null;
    record.updated_at = new Date();
    void errorCode;
  });
}

export async function acquireRefreshLock(
  id: string,
  lockId: string,
): Promise<boolean> {
  return withStore((store) => {
    const record = store.connections.find((item) => item.id === id);
    if (!record) return false;
    const stale =
      !record.refresh_lock_at ||
      record.refresh_lock_at.getTime() < Date.now() - 60_000;
    if (record.refresh_lock_id && !stale) return false;
    record.refresh_lock_id = lockId;
    record.refresh_lock_at = new Date();
    return true;
  });
}

export async function releaseRefreshLock(
  id: string,
  lockId: string,
): Promise<void> {
  await withStore((store) => {
    const record = store.connections.find(
      (item) => item.id === id && item.refresh_lock_id === lockId,
    );
    if (!record) return;
    record.refresh_lock_id = null;
    record.refresh_lock_at = null;
  });
}

export async function createPendingOperation(input: {
  sessionHash: string;
  realmId: string;
  entity: string;
  recordId: string;
  syncToken: string;
  fields: Record<string, unknown>;
  confirmationSecretHash: string;
  ttlSeconds: number;
}): Promise<string> {
  return withStore((store) => {
    const now = new Date();
    const id = newId();
    store.pending.push({
      id,
      session_id: input.sessionHash,
      realm_id: input.realmId,
      entity: input.entity,
      record_id: input.recordId,
      sync_token: input.syncToken,
      fields: input.fields,
      confirmation_secret_hash: input.confirmationSecretHash,
      status: "pending",
      created_at: now,
      expires_at: new Date(now.getTime() + input.ttlSeconds * 1000),
    });
    return id;
  });
}

export async function consumePendingOperation(
  id: string,
  secretHash: string,
  sessionHash: string,
): Promise<PendingOperationDoc | null> {
  return withStore((store) => {
    const index = store.pending.findIndex(
      (item) =>
        item.id === id &&
        item.session_id === sessionHash &&
        item.confirmation_secret_hash === secretHash &&
        item.status === "pending" &&
        item.expires_at.getTime() > Date.now(),
    );
    if (index === -1) return null;
    return store.pending.splice(index, 1)[0];
  });
}

export async function cancelPendingOperation(
  id: string,
  sessionHash: string,
): Promise<void> {
  await withStore((store) => {
    const record = store.pending.find(
      (item) =>
        item.id === id &&
        item.session_id === sessionHash &&
        item.status === "pending",
    );
    if (record) record.status = "cancelled";
  });
}

export async function appendAuditLog(input: {
  sessionHash: string;
  realmId: string | null;
  event: string;
  ok: boolean;
  errorCode?: string | null;
  durationMs: number;
  confirmationId?: string | null;
}): Promise<void> {
  try {
    await withStore((store) => {
      store.audit.push({
        id: newId(),
        session_id: input.sessionHash,
        realm_id: input.realmId,
        event: input.event,
        ok: input.ok,
        error_code: input.errorCode ?? null,
        duration_ms: input.durationMs,
        confirmation_id: input.confirmationId ?? null,
        created_at: new Date(),
      });
    });
  } catch (error) {
    console.error("MCP audit write failed", error);
  }
}

export async function createClaudeOAuthState(input: {
  stateHash: string;
  codeVerifier: EncryptedCredential;
  sessionHash: string;
  returnTo: string;
  redirectUri: string;
  userProfileId: string;
  ttlSeconds: number;
}): Promise<void> {
  await withStore((store) => {
    store.claudeStates = store.claudeStates.filter(
      (item) => item.state_hash !== input.stateHash,
    );
    const now = new Date();
    store.claudeStates.push({
      id: newId(),
      state_hash: input.stateHash,
      code_verifier: input.codeVerifier,
      session_id: input.sessionHash,
      return_to: input.returnTo,
      redirect_uri: input.redirectUri,
      user_profile_id: input.userProfileId,
      created_at: now,
      expires_at: new Date(now.getTime() + input.ttlSeconds * 1000),
    });
  });
}

export async function consumeClaudeOAuthState(
  stateHash: string,
  sessionHash: string,
): Promise<ClaudeStateDoc | null> {
  return withStore((store) => {
    const index = store.claudeStates.findIndex(
      (item) =>
        item.state_hash === stateHash &&
        item.session_id === sessionHash &&
        item.expires_at.getTime() > Date.now(),
    );
    if (index === -1) return null;
    return store.claudeStates.splice(index, 1)[0];
  });
}

export type ClaudeOAuthTokens = {
  connectionId: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
};

export async function saveClaudeOAuthTokens(input: {
  sessionHash: string;
  connectionId: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
}): Promise<ClaudeAuthDoc> {
  return withStore((store) => {
    const now = new Date();
    let record = store.claudeAuth.find(
      (item) => item.session_id === input.sessionHash,
    );
    if (!record) {
      record = {
        id: newId(),
        session_id: input.sessionHash,
        user_id: `claude-${input.sessionHash.slice(0, 12)}`,
        email: null,
        mode: "oauth",
        connection_id: input.connectionId || null,
        access_token: encryptCredential(
          input.accessToken,
          input.sessionHash,
          "claude-oauth",
        ),
        refresh_token: input.refreshToken
          ? encryptCredential(
              input.refreshToken,
              input.sessionHash,
              "claude-oauth",
            )
          : null,
        scopes: input.scopes,
        access_token_expires_at: input.accessTokenExpiresAt,
        refresh_token_expires_at: input.refreshTokenExpiresAt,
        created_at: now,
        updated_at: now,
      };
      store.claudeAuth.push(record);
      return record;
    }
    record.mode = "oauth";
    record.connection_id = input.connectionId || null;
    record.access_token = encryptCredential(
      input.accessToken,
      input.sessionHash,
      "claude-oauth",
    );
    record.refresh_token = input.refreshToken
      ? encryptCredential(input.refreshToken, input.sessionHash, "claude-oauth")
      : null;
    record.scopes = input.scopes;
    record.access_token_expires_at = input.accessTokenExpiresAt;
    record.refresh_token_expires_at = input.refreshTokenExpiresAt;
    record.updated_at = now;
    return record;
  });
}

export async function getClaudeOAuthTokens(
  sessionHash: string,
): Promise<ClaudeOAuthTokens | null> {
  const record = await withStore(
    (store) =>
      store.claudeAuth.find((item) => item.session_id === sessionHash) ?? null,
  );
  if (!record || record.mode !== "oauth" || !record.access_token) return null;
  return {
    connectionId: record.connection_id || "",
    accessToken: decryptCredential(
      record.access_token,
      sessionHash,
      "claude-oauth",
    ),
    refreshToken: record.refresh_token
      ? decryptCredential(record.refresh_token, sessionHash, "claude-oauth")
      : "",
    scopes: record.scopes || [],
    accessTokenExpiresAt: record.access_token_expires_at || null,
    refreshTokenExpiresAt: record.refresh_token_expires_at || null,
  };
}

export async function hasClaudeAuth(sessionHash: string): Promise<boolean> {
  return withStore((store) =>
    store.claudeAuth.some((item) => item.session_id === sessionHash),
  );
}

export async function clearClaudeAuth(sessionHash: string): Promise<void> {
  await withStore((store) => {
    store.claudeAuth = store.claudeAuth.filter(
      (item) => item.session_id !== sessionHash,
    );
  });
}

export async function getAgentPermissions(
  sessionHash: string,
): Promise<AgentPermission[]> {
  const record = await withStore(
    (store) =>
      store.permissions.find((item) => item.session_id === sessionHash) ?? null,
  );
  return record?.scopes ?? [];
}

export async function setAgentPermissions(
  sessionHash: string,
  scopes: AgentPermission[],
): Promise<AgentPermission[]> {
  return withStore((store) => {
    const normalized = normalizeAgentPermissions(scopes);
    const now = new Date();
    let record = store.permissions.find(
      (item) => item.session_id === sessionHash,
    );
    if (!record) {
      record = {
        id: newId(),
        session_id: sessionHash,
        scopes: normalized,
        created_at: now,
        updated_at: now,
      };
      store.permissions.push(record);
      return record.scopes;
    }
    record.scopes = normalized;
    record.updated_at = now;
    return record.scopes;
  });
}

export async function clearAgentPermissions(
  sessionHash: string,
): Promise<void> {
  await withStore((store) => {
    store.permissions = store.permissions.filter(
      (item) => item.session_id !== sessionHash,
    );
  });
}

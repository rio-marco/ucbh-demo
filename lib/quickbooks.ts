import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function getQBConfig() {
  const clientId = process.env.QB_CLIENT_ID || "";
  const clientSecret = process.env.QB_CLIENT_SECRET || "";
  const redirectUri = process.env.QB_REDIRECT_URI || "";
  const environment = (process.env.QB_ENVIRONMENT || "sandbox") as
    | "sandbox"
    | "production";

  return { clientId, clientSecret, redirectUri, environment };
}

/** Resolve the public origin of the current request, including behind tunnels. */
export function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || request.headers.get("host") || url.host;
  const proto = forwardedProto || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/**
 * Use the configured redirect URI when it matches the origin the user is
 * currently on; otherwise derive it. This keeps localhost and tunnel previews
 * working without editing `.env` for every host.
 */
export function getRedirectUri(request: Request): string {
  const origin = getRequestOrigin(request);
  const configured = process.env.QB_REDIRECT_URI?.trim();
  if (configured) {
    try {
      if (new URL(configured).origin === origin) return configured;
    } catch {
      // Fall through to the derived URI if the configured value is invalid.
    }
  }
  return `${origin}/api/quickbooks/callback`;
}

/** Intuit OAuth2 endpoints */
export const INTUIT_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";

export const INTUIT_TOKEN_URL =
  "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

/** QuickBooks API base URLs */
const QB_API_BASE: Record<string, string> = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
};

/** Scopes we request (full accounting read/write) */
export const QB_SCOPES = "com.intuit.quickbooks.accounting";

// ---------------------------------------------------------------------------
// CSRF / State helpers
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), ".data");
const STATE_FILE = path.join(DATA_DIR, "quickbooks-state.json");

export type QBStateRecord = {
  state: string;
  returnTo: string;
  createdAt: string;
};

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

/**
 * Only allow same-origin relative paths as OAuth return destinations.
 * This prevents the callback from being used as an open redirect.
 */
export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value) return "/";

  let decoded = value;

  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep the original value if it is not valid percent-encoding.
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\")
  ) {
    return "/";
  }

  return decoded;
}

/** Generate a random state string and persist it for validation. */
export async function generateState(returnTo = "/"): Promise<string> {
  const state = randomBytes(24).toString("hex");

  await ensureDataDir();

  const record: QBStateRecord = {
    state,
    returnTo: sanitizeReturnTo(returnTo),
    createdAt: new Date().toISOString(),
  };

  await writeFile(STATE_FILE, JSON.stringify(record), "utf8");

  return state;
}

/**
 * Validate and consume the state stored before the OAuth redirect.
 * Returns the stored record (including the return path) or null.
 */
export async function consumeState(
  state: string,
): Promise<QBStateRecord | null> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const stored = JSON.parse(raw) as QBStateRecord;

    // Clean up after validation, whether it matched or not.
    await unlink(STATE_FILE).catch(() => {});

    if (!stored?.state || stored.state !== state) return null;

    return { ...stored, returnTo: sanitizeReturnTo(stored.returnTo) };
  } catch {
    return null;
  }
}

/** Validate that the returned state matches the one we stored. */
export async function validateState(state: string): Promise<boolean> {
  return (await consumeState(state)) !== null;
}

// ---------------------------------------------------------------------------
// Token storage (file-based, easy to clear)
// ---------------------------------------------------------------------------

export type QBTokens = {
  access_token: string;
  refresh_token: string;
  realm_id: string;
  token_type: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
  created_at: string;
};

const TOKENS_FILE = path.join(DATA_DIR, "quickbooks-tokens.json");

export async function saveTokens(tokens: QBTokens): Promise<void> {
  await ensureDataDir();
  await writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2), "utf8");
}

export async function loadTokens(): Promise<QBTokens | null> {
  try {
    const raw = await readFile(TOKENS_FILE, "utf8");
    return JSON.parse(raw) as QBTokens;
  } catch {
    return null;
  }
}

export async function deleteTokens(): Promise<boolean> {
  try {
    await unlink(TOKENS_FILE);
    return true;
  } catch {
    return false;
  }
}

/** Check if the current access token has expired (with 5-min buffer). */
export function isTokenExpired(tokens: QBTokens): boolean {
  const createdMs = new Date(tokens.created_at).getTime();
  const expiresMs = createdMs + tokens.expires_in * 1000 - 5 * 60 * 1000;
  return Date.now() > expiresMs;
}

// ---------------------------------------------------------------------------
// OAuth2 token exchange
// ---------------------------------------------------------------------------

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeCodeForTokens(
  code: string,
  realmId: string,
  redirectUri: string,
): Promise<QBTokens> {
  const { clientId, clientSecret } = getQBConfig();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const response = await fetch(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("QuickBooks token exchange failed:", errorBody);
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    realm_id: realmId,
    token_type: (data.token_type as string) || "bearer",
    expires_in: (data.expires_in as number) || 3600,
    x_refresh_token_expires_in:
      (data.x_refresh_token_expires_in as number) || 8726400,
    created_at: new Date().toISOString(),
  };
}

/** Refresh an expired access token using the refresh token. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<QBTokens> {
  const { clientId, clientSecret } = getQBConfig();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

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
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("QuickBooks token refresh failed:", errorBody);
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const tokens = await loadTokens();

  const updated: QBTokens = {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    realm_id: tokens?.realm_id || "",
    token_type: (data.token_type as string) || "bearer",
    expires_in: (data.expires_in as number) || 3600,
    x_refresh_token_expires_in:
      (data.x_refresh_token_expires_in as number) || 8726400,
    created_at: new Date().toISOString(),
  };

  await saveTokens(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// QuickBooks API requests
// ---------------------------------------------------------------------------

/**
 * Make an authenticated request to the QuickBooks Accounting API.
 * Automatically refreshes the token if expired.
 */
export async function qbApiRequest<T = Record<string, unknown>>(
  endpoint: string,
  tokens: QBTokens,
): Promise<{ data: T; tokens: QBTokens }> {
  let currentTokens = tokens;

  // Auto-refresh if expired
  if (isTokenExpired(currentTokens)) {
    currentTokens = await refreshAccessToken(currentTokens.refresh_token);
  }

  const { environment } = getQBConfig();
  const baseUrl = QB_API_BASE[environment] || QB_API_BASE.sandbox;
  const url = `${baseUrl}/v3/company/${currentTokens.realm_id}/${endpoint}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${currentTokens.access_token}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`QuickBooks API error (${endpoint}):`, errorBody);
    throw new Error(`QuickBooks API request failed: ${response.status}`);
  }

  const data = (await response.json()) as T;
  return { data, tokens: currentTokens };
}

function quickBooksErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      Fault?: {
        Error?: { Message?: string; Detail?: string }[];
      };
    };
    const errors = parsed.Fault?.Error;
    if (Array.isArray(errors) && errors.length) {
      return errors
        .map((item) => [item.Message, item.Detail].filter(Boolean).join(": "))
        .filter(Boolean)
        .join("; ");
    }
  } catch {
    // Fall through to the raw response text.
  }
  const text = body.replace(/\s+/g, " ").trim();
  return text
    ? text.slice(0, 500)
    : `QuickBooks request failed with status ${status}.`;
}

/**
 * Update an existing QuickBooks record. The payload must include `Id` and
 * `SyncToken`; `sparse: true` lets Intuit update only the supplied fields.
 * Automatically refreshes the token if expired.
 */
export async function qbApiUpdate<T = Record<string, unknown>>(
  entity: string,
  tokens: QBTokens,
  payload: Record<string, unknown>,
): Promise<{ data: T; tokens: QBTokens }> {
  let currentTokens = tokens;

  if (isTokenExpired(currentTokens)) {
    currentTokens = await refreshAccessToken(currentTokens.refresh_token);
  }

  const { environment } = getQBConfig();
  const baseUrl = QB_API_BASE[environment] || QB_API_BASE.sandbox;
  const url = `${baseUrl}/v3/company/${currentTokens.realm_id}/${encodeURIComponent(
    entity,
  )}?operation=update`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentTokens.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(`QuickBooks update error (${entity}):`, body);
    throw new Error(quickBooksErrorMessage(response.status, body));
  }

  let data: T;
  try {
    data = JSON.parse(body) as T;
  } catch {
    throw new Error("QuickBooks returned an invalid response.");
  }

  if (
    data &&
    typeof data === "object" &&
    "Fault" in (data as Record<string, unknown>)
  ) {
    throw new Error(quickBooksErrorMessage(response.status, body));
  }

  return { data, tokens: currentTokens };
}

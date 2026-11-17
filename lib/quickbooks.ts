import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function getQBConfig() {
  const clientId = process.env.QB_CLIENT_ID || "";
  const clientSecret = process.env.QB_CLIENT_SECRET || "";
  const redirectUri =
    process.env.QB_REDIRECT_URI ||
    "http://localhost:3000/api/quickbooks/callback";
  const environment = (process.env.QB_ENVIRONMENT || "sandbox") as
    | "sandbox"
    | "production";

  return { clientId, clientSecret, redirectUri, environment };
}

/** Intuit OAuth2 endpoints */
export const INTUIT_AUTH_URL =
  "https://appcenter.intuit.com/connect/oauth2";
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

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

/** Generate a random state string and persist it for validation. */
export async function generateState(): Promise<string> {
  const state = randomBytes(24).toString("hex");
  await ensureDataDir();
  await writeFile(
    STATE_FILE,
    JSON.stringify({ state, createdAt: new Date().toISOString() }),
    "utf8",
  );
  return state;
}

/** Validate that the returned state matches the one we stored. */
export async function validateState(state: string): Promise<boolean> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const stored = JSON.parse(raw) as { state: string };
    // Clean up after validation
    await unlink(STATE_FILE).catch(() => {});
    return stored.state === state;
  } catch {
    return false;
  }
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
): Promise<QBTokens> {
  const { clientId, clientSecret, redirectUri } = getQBConfig();
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

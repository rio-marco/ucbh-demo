import { randomBytes } from "node:crypto";
import { McpError, mcpConfig } from "@/lib/mcp/config";
import { consumeOAuthState, createOAuthState } from "@/lib/mcp/db";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { hashValue } from "@/lib/mcp/security";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function getQBConfig() {
  const clientId = getRuntimeEnv("QB_CLIENT_ID");
  const clientSecret = getRuntimeEnv("QB_CLIENT_SECRET");
  const redirectUri = getRuntimeEnv("QB_REDIRECT_URI");
  const environment = (getRuntimeEnv("QB_ENVIRONMENT") || "sandbox") as
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

function productionRedirectUri(): string {
  const configured = getRuntimeEnv("QB_REDIRECT_URI").trim();
  if (!configured) {
    throw new McpError(
      "config_error",
      "Set QB_REDIRECT_URI to the exact HTTPS URL registered in the Intuit production app.",
    );
  }
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:") {
      throw new Error("must use https");
    }
    if (url.pathname !== "/api/quickbooks/callback") {
      throw new Error("must point to /api/quickbooks/callback");
    }
    if (
      url.hostname === "localhost" ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)
    ) {
      throw new Error("cannot use localhost or an IP address");
    }
    return configured;
  } catch (error) {
    throw new McpError(
      "config_error",
      `QB_REDIRECT_URI is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function getRedirectUri(request: Request): string {
  const { environment } = getQBConfig();
  if (environment === "production") return productionRedirectUri();

  const origin = getRequestOrigin(request);
  const configured = getRuntimeEnv("QB_REDIRECT_URI").trim();
  if (configured) {
    try {
      if (new URL(configured).origin === origin) return configured;
    } catch {}
  }
  return `${origin}/api/quickbooks/callback`;
}

export function getAppOrigin(request: Request): string {
  const { environment } = getQBConfig();
  if (environment === "production") {
    const configured = getRuntimeEnv("QB_REDIRECT_URI").trim();
    try {
      return new URL(configured).origin;
    } catch {}
  }
  return getRequestOrigin(request);
}

/** Intuit OAuth2 endpoints */
export const INTUIT_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";

export const INTUIT_TOKEN_URL =
  "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export const INTUIT_REVOKE_URL =
  "https://oauth.platform.intuit.com/oauth2/v1/tokens/revoke";

/** Scopes we request (full accounting read/write) */
export const QB_SCOPES = "com.intuit.quickbooks.accounting";

// ---------------------------------------------------------------------------
// CSRF / State helpers
// ---------------------------------------------------------------------------

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

/**
 * Persist an OAuth state for one browser session. Multiple users can have
 * pending authorizations at the same time without overwriting each other.
 */
export async function generateState(
  returnTo: string,
  sessionHash: string,
  redirectUri: string,
): Promise<string> {
  const state = randomBytes(24).toString("hex");
  await createOAuthState({
    stateHash: hashValue(state),
    sessionHash,
    returnTo: sanitizeReturnTo(returnTo),
    redirectUri,
    ttlSeconds: mcpConfig().oauthStateTtlSeconds,
  });
  return state;
}

/** Consume a state only for the session that started the authorization. */
export async function consumeState(
  state: string,
  sessionHash: string,
): Promise<{
  returnTo: string;
  sessionHash: string;
  redirectUri: string | null;
} | null> {
  const record = await consumeOAuthState(hashValue(state), sessionHash);
  if (!record) return null;
  return {
    returnTo: sanitizeReturnTo(record.return_to),
    sessionHash: record.session_id,
    redirectUri: record.redirect_uri || null,
  };
}

// ---------------------------------------------------------------------------
// Token exchange
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

export async function revokeQuickBooksTokens(tokens: string[]): Promise<void> {
  const values = tokens.filter(Boolean);
  if (!values.length) return;
  const { clientId, clientSecret } = getQBConfig();
  if (!clientId || !clientSecret) return;

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );
  await Promise.all(
    values.map((token) =>
      fetch(INTUIT_REVOKE_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({ token }).toString(),
      }).catch(() => undefined),
    ),
  );
}

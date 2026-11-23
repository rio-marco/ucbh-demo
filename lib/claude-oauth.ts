import { createHash, randomBytes } from "node:crypto";
import { getRequestOrigin } from "@/lib/quickbooks";

const DEFAULT_LOGIN_URL = "https://claude.ai/login";
const DEFAULT_AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const DEFAULT_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const DEFAULT_SCOPES = "org:read";

export type ClaudeOAuthConfig = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string;
  loginUrl: string;
};

export function getClaudeOAuthConfig(): ClaudeOAuthConfig {
  const clientId = process.env.CLAUDE_CLIENT_ID || "";
  const clientSecret = process.env.CLAUDE_CLIENT_SECRET || "";
  return {
    enabled: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    authorizeUrl:
      process.env.CLAUDE_OAUTH_AUTHORIZE_URL || DEFAULT_AUTHORIZE_URL,
    tokenUrl: process.env.CLAUDE_OAUTH_TOKEN_URL || DEFAULT_TOKEN_URL,
    scopes: process.env.CLAUDE_OAUTH_SCOPES || DEFAULT_SCOPES,
    loginUrl: process.env.CLAUDE_LOGIN_URL || DEFAULT_LOGIN_URL,
  };
}

export function getClaudeRedirectUri(request: Request): string {
  return (
    process.env.CLAUDE_OAUTH_REDIRECT_URI ||
    `${getRequestOrigin(request)}/api/claude/callback`
  );
}

export function createClaudePkce(): {
  state: string;
  stateHash: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return {
    state,
    stateHash: createHash("sha256").update(state).digest("hex"),
    codeVerifier,
    codeChallenge,
  };
}

export function buildClaudeAuthUrl(input: {
  config: ClaudeOAuthConfig;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.config.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: input.config.scopes,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${input.config.authorizeUrl}?${params.toString()}`;
}

export async function exchangeClaudeCode(input: {
  config: ClaudeOAuthConfig;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ userId: string; email: string | null }> {
  const response = await fetch(input.config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      code_verifier: input.codeVerifier,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    user?: { id?: string; email?: string };
    error?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error || "Claude token exchange failed.");
  }
  return {
    userId: payload.user?.id || "claude-user",
    email: payload.user?.email || null,
  };
}

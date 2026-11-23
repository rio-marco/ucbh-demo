import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { getRequestOrigin } from "@/lib/quickbooks";

const CLIENT_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const DEFAULT_AUTHORIZE_URL = "https://auth.claude.com/oauth/authorize";
const DEFAULT_PAR_URL = "https://auth.claude.com/v1/oauth/par";
const DEFAULT_TOKEN_URL = "https://auth.claude.com/v1/oauth/token";
const DEFAULT_REVOKE_URL = "https://auth.claude.com/v1/oauth/revoke";
const DEFAULT_SCOPES = "billing:attribution";

export type ClaudeOAuthConfig = {
  clientId: string;
  userProfileId: string;
  redirectUri: string;
  authorizeUrl: string;
  parUrl: string;
  tokenUrl: string;
  revokeUrl: string;
  scopes: string;
  issuer: string;
  audience: string;
  subject: string;
  kid: string;
  privateKeyPem: string;
};

export type ClaudeTokenSet = {
  accessToken: string;
  refreshToken: string;
  connectionId: string;
  scope: string;
  expiresIn: number | null;
  refreshTokenExpiresIn: number | null;
};

function normalisePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export function getClaudeOAuthConfig(): ClaudeOAuthConfig | null {
  const config: ClaudeOAuthConfig = {
    clientId: getRuntimeEnv("CLAUDE_CLIENT_ID"),
    userProfileId: getRuntimeEnv("CLAUDE_USER_PROFILE_ID"),
    redirectUri: getRuntimeEnv("CLAUDE_OAUTH_REDIRECT_URI"),
    authorizeUrl:
      getRuntimeEnv("CLAUDE_AUTHORIZE_URL") || DEFAULT_AUTHORIZE_URL,
    parUrl: getRuntimeEnv("CLAUDE_PAR_URL") || DEFAULT_PAR_URL,
    tokenUrl: getRuntimeEnv("CLAUDE_TOKEN_URL") || DEFAULT_TOKEN_URL,
    revokeUrl: getRuntimeEnv("CLAUDE_REVOKE_URL") || DEFAULT_REVOKE_URL,
    scopes: getRuntimeEnv("CLAUDE_OAUTH_SCOPES") || DEFAULT_SCOPES,
    issuer: getRuntimeEnv("CLAUDE_CLIENT_ASSERTION_ISSUER"),
    audience: getRuntimeEnv("CLAUDE_CLIENT_ASSERTION_AUDIENCE"),
    subject: getRuntimeEnv("CLAUDE_CLIENT_ASSERTION_SUBJECT"),
    kid: getRuntimeEnv("CLAUDE_CLIENT_ASSERTION_KID"),
    privateKeyPem: normalisePrivateKey(
      getRuntimeEnv("CLAUDE_CLIENT_ASSERTION_PRIVATE_KEY"),
    ),
  };
  const required = [
    config.clientId,
    config.userProfileId,
    config.issuer,
    config.audience,
    config.subject,
    config.kid,
    config.privateKeyPem,
  ];
  return required.every(Boolean) ? config : null;
}

export function getClaudeRedirectUri(
  request: Request,
  config: ClaudeOAuthConfig,
): string {
  const origin = getRequestOrigin(request);
  const configured = config.redirectUri.trim();
  if (configured) {
    try {
      if (new URL(configured).origin === origin) return configured;
    } catch {}
  }
  return `${origin}/api/claude/callback`;
}

export function createClaudePkcePair(): {
  verifier: string;
  challenge: string;
} {
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

export function createClaudeOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function hashClaudeOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

function createClientAssertion(config: ClaudeOAuthConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: config.kid }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: config.issuer,
      sub: config.subject,
      aud: config.audience,
      iat: now,
      exp: now + 300,
      jti: randomUUID(),
    }),
  ).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), {
    key: createPrivateKey(config.privateKeyPem),
  }).toString("base64url");
  return `${signingInput}.${signature}`;
}

function clientAuthentication(config: ClaudeOAuthConfig) {
  return {
    client_id: config.clientId,
    client_assertion_type: CLIENT_ASSERTION_TYPE,
    client_assertion: createClientAssertion(config),
  };
}

async function oauthError(response: Response): Promise<string> {
  const body = await response.text();
  let details = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as {
      error?: string;
      error_description?: string;
    };
    details =
      parsed.error_description || parsed.error || details;
  } catch {}
  return `Claude login failed (${response.status}). ${details}`.trim();
}

export function getClaudeJwks(config: ClaudeOAuthConfig): {
  keys: Record<string, string>[];
} {
  const publicKey = createPublicKey(config.privateKeyPem);
  const jwk = publicKey.export({ format: "jwk" });
  return {
    keys: [
      {
        ...jwk,
        kid: config.kid,
        use: "sig",
        alg: "RS256",
      },
    ],
  };
}

export async function createClaudeParRequest(input: {
  config: ClaudeOAuthConfig;
  state: string;
  codeChallenge: string;
}): Promise<string> {
  const { config } = input;
  const response = await fetch(config.parUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      response_type: "code",
      redirect_uri: config.redirectUri,
      scope: config.scopes,
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
      connection_type: "organization_shared",
      connection_auth_target: "platform",
      user_profile_id: config.userProfileId,
      ...clientAuthentication(config),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(await oauthError(response));
  const data = (await response.json()) as {
    request_uri?: string;
  };
  if (!data.request_uri) throw new Error("Claude did not return a request URI.");
  return data.request_uri;
}

export function buildClaudeAuthorizeUrl(
  config: ClaudeOAuthConfig,
  requestUri: string,
): string {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("request_uri", requestUri);
  return url.toString();
}

function parseTokenSet(data: Record<string, unknown>): ClaudeTokenSet {
  return {
    accessToken: typeof data.access_token === "string" ? data.access_token : "",
    refreshToken:
      typeof data.refresh_token === "string" ? data.refresh_token : "",
    connectionId:
      typeof data.connection_id === "string" ? data.connection_id : "",
    scope: typeof data.scope === "string" ? data.scope : "",
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : null,
    refreshTokenExpiresIn:
      typeof data.refresh_token_expires_in === "number"
        ? data.refresh_token_expires_in
        : null,
  };
}

async function requestTokens(
  config: ClaudeOAuthConfig,
  body: Record<string, unknown>,
): Promise<ClaudeTokenSet> {
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...clientAuthentication(config), ...body }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(await oauthError(response));
  const tokens = parseTokenSet((await response.json()) as Record<string, unknown>);
  if (!tokens.accessToken) throw new Error("Claude did not return an access token.");
  return tokens;
}

export function exchangeClaudeCode(input: {
  config: ClaudeOAuthConfig;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<ClaudeTokenSet> {
  return requestTokens(input.config, {
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.codeVerifier,
    redirect_uri: input.redirectUri,
  });
}

export function refreshClaudeToken(input: {
  config: ClaudeOAuthConfig;
  refreshToken: string;
}): Promise<ClaudeTokenSet> {
  return requestTokens(input.config, {
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });
}

export async function revokeClaudeConnection(input: {
  config: ClaudeOAuthConfig;
  connectionId: string;
}): Promise<void> {
  const response = await fetch(input.config.revokeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...clientAuthentication(input.config),
      connection_id: input.connectionId,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(await oauthError(response));
}

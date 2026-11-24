import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mcpConfig, McpError } from "@/lib/mcp/config";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const SESSION_COOKIE = "ucbh_sid";
export const SESSION_TOKEN_BYTES = 32;
const SESSION_TTL_SECONDS = mcpConfig().sessionTtlSeconds;
const MCP_TOKEN_TTL_SECONDS = mcpConfig().mcpTokenTtlSeconds;

export type EncryptedCredential = {
  iv: string;
  authTag: string;
  ciphertext: string;
};

export type McpTokenPayload = {
  v: 1;
  sid: string;
  nonce: string;
  iat: number;
  exp: number;
};

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

export function isWellFormedSessionToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

function cookieFlags(secure: boolean): string {
  return [
    "Path=/",
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    "SameSite=Lax",
  ].join("; ");
}

export function sessionCookieHeader(token: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    cookieFlags(secure),
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join("; ");
}

export function clearSessionCookieHeader(secure: boolean): string {
  return [
    `${SESSION_COOKIE}=`,
    cookieFlags(secure),
    "Max-Age=0",
  ].join("; ");
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function setCookieHeader(
  response: Response,
  cookie: string,
): Response {
  response.headers.append("set-cookie", cookie);
  return response;
}

function encryptionContext(sessionId: string, realmId: string): Buffer {
  return Buffer.from(`${sessionId}\u0000${realmId}`, "utf8");
}

function getEncryptionKey(): Buffer {
  const raw = getRuntimeEnv("TOKEN_ENCRYPTION_KEY");
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new McpError("config_error");
  }
  if (key.length !== 32) {
    throw new McpError("config_error");
  }
  return key;
}

export function encryptCredential(
  plaintext: string,
  sessionId: string,
  realmId: string,
): EncryptedCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  cipher.setAAD(encryptionContext(sessionId, realmId));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptCredential(
  value: EncryptedCredential | null | undefined,
  sessionId: string,
  realmId: string,
): string {
  if (
    !value ||
    typeof value.iv !== "string" ||
    typeof value.authTag !== "string" ||
    typeof value.ciphertext !== "string"
  ) {
    throw new McpError("not_connected");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAAD(encryptionContext(sessionId, realmId));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new McpError("not_connected");
  }
}

function getSigningSecret(): string {
  const secret = getRuntimeEnv("MCP_SIGNING_SECRET");
  if (secret.length < 32) throw new McpError("config_error");
  return secret;
}

function signPart(payload: string): string {
  return createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("base64url");
}

export function createMcpToken(sessionHash: string): {
  token: string;
  nonce: string;
  expiresAt: Date;
} {
  const now = Math.floor(Date.now() / 1000);
  const payload: McpTokenPayload = {
    v: 1,
    sid: sessionHash,
    nonce: randomUUID(),
    iat: now,
    exp: now + MCP_TOKEN_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    token: `${encoded}.${signPart(encoded)}`,
    nonce: payload.nonce,
    expiresAt: new Date(payload.exp * 1000),
  };
}

export function verifyMcpToken(token: string): McpTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 2) throw new McpError("session_expired");
  const [encoded, signature] = parts;
  const expected = signPart(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new McpError("session_expired");
  }

  let payload: McpTokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as McpTokenPayload;
  } catch {
    throw new McpError("session_expired");
  }

  if (
    payload?.v !== 1 ||
    typeof payload.sid !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new McpError("session_expired");
  }

  return payload;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

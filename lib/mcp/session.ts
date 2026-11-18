import { mcpConfig, McpError } from "@/lib/mcp/config";
import {
  consumeMcpNonce,
  createBrowserSession,
  getBrowserSession,
  touchBrowserSession,
} from "@/lib/mcp/db";
import {
  bearerToken,
  hashValue,
  isWellFormedSessionToken,
  newSessionToken,
  readCookie,
  SESSION_COOKIE,
  verifyMcpToken,
} from "@/lib/mcp/security";

export type BrowserSession = {
  raw: string;
  hash: string;
  needsCookie: boolean;
};

export async function resolveBrowserSession(
  request: Request,
): Promise<BrowserSession> {
  const raw = readCookie(request, SESSION_COOKIE);
  const ttl = mcpConfig().sessionTtlSeconds;

  if (raw && isWellFormedSessionToken(raw)) {
    const hash = hashValue(raw);
    const existing = await getBrowserSession(hash);
    if (existing && existing.expires_at.getTime() > Date.now()) {
      const remaining = existing.expires_at.getTime() - Date.now();
      if (remaining < 7 * 24 * 60 * 60 * 1000) {
        await touchBrowserSession(hash, ttl);
        return { raw, hash, needsCookie: true };
      }
      return { raw, hash, needsCookie: false };
    }
  }

  const fresh = newSessionToken();
  const hash = hashValue(fresh);
  await createBrowserSession(hash, ttl);
  return { raw: fresh, hash, needsCookie: true };
}

export async function authenticateMcpRequest(
  request: Request,
): Promise<{ sessionHash: string }> {
  const token = bearerToken(request);
  if (!token) throw new McpError("session_expired");

  const payload = verifyMcpToken(token);
  const used = await consumeMcpNonce(payload.nonce, payload.sid);
  if (!used) throw new McpError("session_expired");

  const session = await getBrowserSession(payload.sid);
  if (!session || session.expires_at.getTime() <= Date.now()) {
    throw new McpError("session_expired");
  }

  return { sessionHash: payload.sid };
}

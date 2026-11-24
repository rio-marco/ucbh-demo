import {
  mcpErrorCode,
  mcpErrorMessage,
  mcpMessage,
} from "@/lib/mcp/config";
import type { BrowserSession } from "@/lib/mcp/session";
import { setCookieHeader, sessionCookieHeader } from "@/lib/mcp/security";

export function mcpJson(
  body: Record<string, unknown>,
  status = 200,
  session?: BrowserSession | null,
): Response {
  const response = Response.json(body, { status });
  if (session?.needsCookie) {
    setCookieHeader(response, sessionCookieHeader(session.raw, session.secure));
  }
  return response;
}

export function redirectWithSession(
  url: string,
  session?: BrowserSession | null,
): Response {
  const response = Response.redirect(url);
  if (session?.needsCookie) {
    setCookieHeader(response, sessionCookieHeader(session.raw, session.secure));
  }
  return response;
}

export function mcpErrorResponse(
  error: unknown,
  session?: BrowserSession | null,
): Response {
  const code = mcpErrorCode(error);
  const status =
    code === "session_expired"
      ? 401
      : code === "config_error" || code === "mcp_unavailable"
        ? 503
        : code === "claude_error"
          ? 502
          : 400;
  const response = Response.json(
    { error: mcpErrorMessage(error), code },
    { status },
  );
  if (session?.needsCookie) {
    setCookieHeader(response, sessionCookieHeader(session.raw, session.secure));
  }
  return response;
}

export function mcpFriendly(code: Parameters<typeof mcpMessage>[0]): string {
  return mcpMessage(code);
}

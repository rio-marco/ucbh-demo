import { getClaudeConfig, type ClaudeCredentials } from "@/lib/claude";
import { getClaudeOAuthConfig, refreshClaudeToken } from "@/lib/claude-oauth";
import { getClaudeOAuthTokens, saveClaudeOAuthTokens } from "@/lib/mcp/db";

export type ClaudeSessionCredentials = ClaudeCredentials & {
  connectionId: string;
};

export async function getClaudeSessionCredentials(
  sessionHash: string,
): Promise<ClaudeSessionCredentials | null> {
  let tokens = await getClaudeOAuthTokens(sessionHash);
  if (!tokens) return null;
  const config = getClaudeOAuthConfig();

  const expiresAt = tokens.accessTokenExpiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (expiresAt <= Date.now() + 60_000) {
    if (!tokens.refreshToken) return null;
    if (!config) return null;
    try {
      const refreshed = await refreshClaudeToken({
        config,
        refreshToken: tokens.refreshToken,
      });
      const now = Date.now();
      const refreshTokenExpiresAt = refreshed.refreshTokenExpiresIn
        ? new Date(now + refreshed.refreshTokenExpiresIn * 1000)
        : tokens.refreshTokenExpiresAt;
      const next = {
        sessionHash,
        connectionId: refreshed.connectionId || tokens.connectionId,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || tokens.refreshToken,
        scopes: refreshed.scope
          ? refreshed.scope.split(/\s+/).filter(Boolean)
          : tokens.scopes,
        accessTokenExpiresAt: refreshed.expiresIn
          ? new Date(now + refreshed.expiresIn * 1000)
          : null,
        refreshTokenExpiresAt,
      };
      await saveClaudeOAuthTokens(next);
      tokens = await getClaudeOAuthTokens(sessionHash);
      if (!tokens) return null;
    } catch {
      return null;
    }
  }

  return {
    authToken: tokens.accessToken,
    model: getClaudeConfig().model,
    connectionId: tokens.connectionId,
    billingMode: "connection",
  };
}

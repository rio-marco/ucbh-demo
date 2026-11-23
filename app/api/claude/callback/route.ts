import {
  exchangeClaudeCode,
  getClaudeOAuthConfig,
  getClaudeRedirectUri,
} from "@/lib/claude-oauth";
import { consumeClaudeOAuthState, saveClaudeAuth } from "@/lib/mcp/db";
import { resolveBrowserSession } from "@/lib/mcp/session";
import { getRequestOrigin, sanitizeReturnTo } from "@/lib/quickbooks";
import { hashValue } from "@/lib/mcp/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectWith(
  request: Request,
  returnTo: string,
  params: Record<string, string>,
): Response {
  const url = new URL(sanitizeReturnTo(returnTo), getRequestOrigin(request));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString());
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const session = await resolveBrowserSession(request);
  const config = getClaudeOAuthConfig();
  const stateHash = state ? hashValue(state) : "";
  const record = stateHash
    ? await consumeClaudeOAuthState(stateHash, session.hash)
    : null;
  const returnTo = record?.return_to || "/";

  if (error || !state || !record) {
    return redirectWith(request, returnTo, {
      claude: "error",
      reason: error || "invalid_state",
    });
  }

  if (!config.enabled || !code) {
    return redirectWith(request, returnTo, {
      claude: "error",
      reason: "missing_params",
    });
  }

  try {
    const profile = await exchangeClaudeCode({
      config,
      code,
      codeVerifier: record.code_verifier,
      redirectUri: getClaudeRedirectUri(request),
    });
    await saveClaudeAuth({
      sessionHash: session.hash,
      userId: profile.userId,
      email: profile.email,
      mode: "oauth",
    });
    return redirectWith(request, returnTo, { claude: "connected" });
  } catch (exchangeError) {
    console.error("Claude OAuth error:", exchangeError);
    return redirectWith(request, returnTo, {
      claude: "error",
      reason: "token_exchange",
    });
  }
}

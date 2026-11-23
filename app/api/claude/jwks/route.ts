import { getClaudeJwks, getClaudeOAuthConfig } from "@/lib/claude-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getClaudeOAuthConfig();
  return Response.json(
    config ? getClaudeJwks(config) : { keys: [] },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}

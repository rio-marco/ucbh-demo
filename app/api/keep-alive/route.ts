export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  console.log(`[keep-alive] API is running at ${new Date().toISOString()}`);
  return Response.json({ ok: true, timestamp: new Date().toISOString() });
}

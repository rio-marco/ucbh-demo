import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUIDE_IMAGES = new Set([
  "mcp-connection.png",
  "permission.png",
  "upload-files.png",
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!GUIDE_IMAGES.has(name)) {
    return Response.json({ error: "Image not found." }, { status: 404 });
  }

  try {
    const bytes = await readFile(join(process.cwd(), "image", name));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Image not found." }, { status: 404 });
  }
}

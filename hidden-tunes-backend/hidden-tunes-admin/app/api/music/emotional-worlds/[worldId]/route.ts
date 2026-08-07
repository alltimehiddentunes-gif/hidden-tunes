import { NextRequest, NextResponse } from "next/server";
import { loadEmotionalWorld } from "@/lib/emotionalWorldCatalog";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await context.params; const query = request.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(query.get("limit")) || 50)); const cursor = Math.max(0, Number(query.get("cursor")) || 0);
  const minimumConfidence = query.get("minimumConfidence") ?? undefined; const excludeIds = (query.get("excludeSongIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 500);
  if (minimumConfidence && !["high", "strong", "broadened"].includes(minimumConfidence)) return NextResponse.json({ error: "Invalid minimumConfidence." }, { status: 400 });
  try { const result = await loadEmotionalWorld(worldId, { limit, cursor, minimumConfidence, excludeIds }); return result ? NextResponse.json(result) : NextResponse.json({ error: "Emotional World not found or not approved." }, { status: 404 }); }
  catch { return NextResponse.json({ error: "Emotional World is temporarily unavailable." }, { status: 503 }); }
}

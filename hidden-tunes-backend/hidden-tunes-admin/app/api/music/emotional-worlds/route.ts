import { NextResponse } from "next/server";
import { loadEmotionalWorldRegistry } from "@/lib/emotionalWorldCatalog";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { try { return NextResponse.json(await loadEmotionalWorldRegistry()); } catch { return NextResponse.json({ error: "Emotional Worlds are temporarily unavailable." }, { status: 503 }); } }

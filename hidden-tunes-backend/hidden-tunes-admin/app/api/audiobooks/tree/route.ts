import { NextResponse } from "next/server";

import { jsonAudiobookError, listAudiobookCategories } from "@/lib/audiobookCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const categories = await listAudiobookCategories(false);
    return NextResponse.json({ success: true, categories });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error.";
    return jsonAudiobookError("Failed to load audiobook tree.", 500, message);
  }
}

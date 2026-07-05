import { NextResponse } from "next/server";

import {
  jsonAudiobookError,
  listAudiobookCategories,
  logAudiobookError,
} from "@/lib/audiobookCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const categories = await listAudiobookCategories(false);
    return NextResponse.json({ success: true, categories });
  } catch (error) {
    logAudiobookError("Failed to load audiobook categories.", error);
    return jsonAudiobookError("Failed to load audiobook categories.", 500, error);
  }
}

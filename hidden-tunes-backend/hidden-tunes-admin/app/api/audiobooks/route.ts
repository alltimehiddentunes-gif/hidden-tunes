import { NextRequest, NextResponse } from "next/server";

import {
  cleanAudiobookFilter,
  jsonAudiobookError,
  listAudiobooks,
  logAudiobookError,
  parseAudiobookLimit,
  parseAudiobookPage,
} from "@/lib/audiobookCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = parseAudiobookPage(params.get("page"));
  const limit = parseAudiobookLimit(params.get("limit"));
  const category = cleanAudiobookFilter(params.get("category"));

  try {
    const result = await listAudiobooks({
      page,
      limit,
      category,
      mature: false,
    });

    return NextResponse.json({
      success: true,
      category,
      audiobooks: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    logAudiobookError("Failed to load audiobooks.", error);
    return jsonAudiobookError("Failed to load audiobooks.", 500, error);
  }
}

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
  const cursor = cleanAudiobookFilter(params.get("cursor"));
  const language = cleanAudiobookFilter(params.get("language"));
  const author = cleanAudiobookFilter(params.get("author"));
  const narrator = cleanAudiobookFilter(params.get("narrator"));
  const completeOnly = params.get("complete_only") === "true";

  try {
    const result = await listAudiobooks({
      page,
      limit,
      cursor,
      category,
      language,
      author,
      narrator,
      completeOnly,
      includeTotal: page === 1 && !cursor,
      mature: false,
    });

    return NextResponse.json({
      success: true,
      category,
      items: result.items,
      audiobooks: result.items,
      pagination: result.pagination,
      nextCursor: result.pagination.nextCursor ?? null,
      hasMore: result.pagination.hasMore,
    });
  } catch (error) {
    logAudiobookError("Failed to load audiobooks.", error);
    return jsonAudiobookError("Failed to load audiobooks.", 500, error);
  }
}

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
  const q = cleanAudiobookFilter(params.get("q"));
  const page = parseAudiobookPage(params.get("page"));
  const limit = parseAudiobookLimit(params.get("limit"));

  try {
    const result = q
      ? await listAudiobooks({ page, limit, searchQuery: q, mature: true })
      : { items: [], pagination: { page, limit, total: 0, totalPages: 0, hasMore: false } };

    return NextResponse.json({
      success: true,
      q: q || "",
      audiobooks: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    logAudiobookError("Failed to search mature audiobooks.", error);
    return jsonAudiobookError("Failed to search mature audiobooks.", 500, error);
  }
}

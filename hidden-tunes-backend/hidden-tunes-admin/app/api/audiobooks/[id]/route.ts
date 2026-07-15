import { NextRequest, NextResponse } from "next/server";

import {
  cleanAudiobookFilter,
  jsonAudiobookError,
  loadAudiobookDetail,
  logAudiobookError,
  parseAudiobookLimit,
} from "@/lib/audiobookCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const params = request.nextUrl.searchParams;
  const chapterLimit = parseAudiobookLimit(params.get("chapter_limit"));
  const chapterCursor = cleanAudiobookFilter(params.get("chapter_cursor"));

  try {
    const detail = await loadAudiobookDetail(id, false, {
      chapterLimit,
      chapterCursor,
    });
    if (!detail) return jsonAudiobookError("Audiobook not found.", 404);

    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    logAudiobookError("Failed to load audiobook.", error);
    return jsonAudiobookError("Failed to load audiobook.", 500, error);
  }
}

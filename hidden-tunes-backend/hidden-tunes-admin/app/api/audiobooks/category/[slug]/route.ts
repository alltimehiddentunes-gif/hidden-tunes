import { NextRequest, NextResponse } from "next/server";

import {
  cleanAudiobookFilter,
  jsonAudiobookError,
  listAudiobooks,
  parseAudiobookLimit,
  parseAudiobookPage,
} from "@/lib/audiobookCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const category = cleanAudiobookFilter(slug);
  if (!category) return jsonAudiobookError("Invalid audiobook category.", 400);

  const params = request.nextUrl.searchParams;
  const page = parseAudiobookPage(params.get("page"));
  const limit = parseAudiobookLimit(params.get("limit"));

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
    const message =
      error instanceof Error ? error.message : "Unknown database error.";
    return jsonAudiobookError("Failed to load audiobook category.", 500, message);
  }
}

import { NextRequest, NextResponse } from "next/server";

import {
  cleanLectureFilter,
  jsonLectureError,
  logLectureError,
  parseLectureLimit,
  parseLecturePage,
  searchLectureItems,
} from "@/lib/lectureCatalog";
import { canAccessMatureContentFromRequest } from "@/lib/matureContentAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = parseLecturePage(params.get("page"));
  const limit = parseLectureLimit(params.get("limit"));
  const category = cleanLectureFilter(params.get("category"));
  const canAccessMature = canAccessMatureContentFromRequest(request);

  try {
    const result = await searchLectureItems({
      page,
      limit,
      categorySlug: category,
      canAccessMature,
    });
    return NextResponse.json({
      success: true,
      items: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    logLectureError("Failed to list lecture items.", error);
    return jsonLectureError("Failed to list lecture items.", 500, error);
  }
}

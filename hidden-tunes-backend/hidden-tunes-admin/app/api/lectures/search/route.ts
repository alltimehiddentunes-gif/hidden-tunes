import { NextRequest, NextResponse } from "next/server";

import {
  cleanLectureFilter,
  jsonLectureError,
  logLectureError,
  parseLectureLimit,
  parseLecturePage,
  searchLectureItems,
} from "@/lib/lectureCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = cleanLectureFilter(params.get("q"));
  const page = parseLecturePage(params.get("page"));
  const limit = parseLectureLimit(params.get("limit"));

  try {
    const result = q
      ? await searchLectureItems({ q, page, limit })
      : {
          items: [],
          pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
        };

    return NextResponse.json({
      success: true,
      q: q || "",
      lectures: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    logLectureError("Failed to search lectures.", error);
    return jsonLectureError("Failed to search lectures.", 500, error);
  }
}

import { NextRequest, NextResponse } from "next/server";

import {
  cleanLectureFilter,
  jsonLectureError,
  listLectureItemsByCategory,
  logLectureError,
  parseLectureLimit,
  parseLecturePage,
} from "@/lib/lectureCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const category = cleanLectureFilter(slug);
  const params = request.nextUrl.searchParams;
  const page = parseLecturePage(params.get("page"));
  const limit = parseLectureLimit(params.get("limit"));

  if (!category) {
    return jsonLectureError("Lecture category is required.", 400);
  }

  try {
    const result = await listLectureItemsByCategory({ slug: category, page, limit });
    return NextResponse.json({
      success: true,
      category,
      lectures: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    logLectureError("Failed to load lecture category.", error);
    return jsonLectureError("Failed to load lecture category.", 500, error);
  }
}

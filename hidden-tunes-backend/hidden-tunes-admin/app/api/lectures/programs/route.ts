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
  const coachingSpecialty = cleanLectureFilter(params.get("coaching_specialty"));
  const coachId = cleanLectureFilter(params.get("coach_id"));
  const programFormat = cleanLectureFilter(params.get("program_format"));
  const mediaType = cleanLectureFilter(params.get("media_type"));
  const language = cleanLectureFilter(params.get("language"));
  const country = cleanLectureFilter(params.get("country"));
  const canAccessMature = canAccessMatureContentFromRequest(request);

  try {
    const result = await searchLectureItems({
      page,
      limit,
      categorySlug: category,
      coachingSpecialty,
      coachId,
      programFormat,
      mediaType,
      language,
      country,
      canAccessMature,
    });

    return NextResponse.json({
      success: true,
      programs: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    logLectureError("Failed to list lecture programs.", error);
    return jsonLectureError("Failed to list lecture programs.", 500, error);
  }
}

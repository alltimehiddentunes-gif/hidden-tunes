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
  const q = cleanLectureFilter(params.get("q"));
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
    const result =
      q || category || coachingSpecialty || coachId || programFormat || mediaType || language || country
        ? await searchLectureItems({
            q,
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
          })
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

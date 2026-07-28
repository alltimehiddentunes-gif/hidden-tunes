import { NextResponse } from "next/server";

import {
  getLectureItemById,
  jsonLectureError,
  logLectureError,
  parseLectureLimit,
  parseLecturePage,
} from "@/lib/lectureCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const page = parseLecturePage(url.searchParams.get("page"));
  const limit = parseLectureLimit(url.searchParams.get("limit"));

  try {
    const detail = await getLectureItemById(id, { page, limit });
    if (!detail) return jsonLectureError("Program not found.", 404);

    return NextResponse.json({
      success: true,
      program: detail.lecture,
      items: detail.lessons,
      pagination: detail.pagination,
    });
  } catch (error) {
    logLectureError("Failed to load lecture program items.", error);
    return jsonLectureError("Failed to load lecture program items.", 500, error);
  }
}

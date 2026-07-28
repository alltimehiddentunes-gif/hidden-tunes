import { NextResponse } from "next/server";

import {
  getLectureItemById,
  jsonLectureError,
  logLectureError,
} from "@/lib/lectureCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const detail = await getLectureItemById(id, { page: 1, limit: 1 });
    if (!detail) return jsonLectureError("Program not found.", 404);

    return NextResponse.json({
      success: true,
      program: detail.lecture,
    });
  } catch (error) {
    logLectureError("Failed to load lecture program.", error);
    return jsonLectureError("Failed to load lecture program.", 500, error);
  }
}

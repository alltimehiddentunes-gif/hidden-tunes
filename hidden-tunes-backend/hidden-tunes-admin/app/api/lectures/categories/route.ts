import { NextResponse } from "next/server";

import {
  jsonLectureError,
  listLectureCategories,
  logLectureError,
} from "@/lib/lectureCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const categories = await listLectureCategories();
    return NextResponse.json({ success: true, categories });
  } catch (error) {
    logLectureError("Failed to load lecture categories.", error);
    return jsonLectureError("Failed to load lecture categories.", 500, error);
  }
}

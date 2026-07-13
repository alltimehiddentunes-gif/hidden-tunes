import { NextRequest, NextResponse } from "next/server";

import {
  jsonMotivationError,
  parsePositiveInt,
  MOTIVATION_DEFAULT_PAGE_SIZE,
  MOTIVATION_MAX_PAGE_SIZE,
  serializeMotivationError,
} from "@/lib/motivationCatalog";
import {
  listMotivationProgramItems,
  loadMotivationProgram,
  loadStandaloneProgramFromItem,
} from "@/lib/motivationPrograms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ idOrSlug: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { idOrSlug } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const page = parsePositiveInt(searchParams.get("page"), 1, 10_000);
  const limit = parsePositiveInt(
    searchParams.get("limit"),
    MOTIVATION_DEFAULT_PAGE_SIZE,
    MOTIVATION_MAX_PAGE_SIZE
  );

  try {
    const program = await loadMotivationProgram(String(idOrSlug || ""));
    if (program) {
      const result = await listMotivationProgramItems({
        programId: program.id,
        page,
        limit,
      });
      return NextResponse.json({ success: true, program, ...result });
    }

    const standalone = await loadStandaloneProgramFromItem(String(idOrSlug || ""));
    if (!standalone) {
      return jsonMotivationError("Motivation program not found.", 404);
    }

    return NextResponse.json({
      success: true,
      program: standalone.program,
      items: standalone.items,
      pagination: standalone.pagination,
      standalone: true,
    });
  } catch (error) {
    console.error("[motivation] program items failed", serializeMotivationError(error));
    return jsonMotivationError("Failed to load motivation program items.", 500, error);
  }
}

import { NextRequest, NextResponse } from "next/server";

import { jsonMotivationError, serializeMotivationError } from "@/lib/motivationCatalog";
import { resolveMotivationProgramBundle } from "@/lib/motivationPrograms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ idOrSlug: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { idOrSlug } = await context.params;

  try {
    const bundle = await resolveMotivationProgramBundle(String(idOrSlug || ""));
    if (!bundle) {
      return jsonMotivationError("Motivation program not found.", 404);
    }

    return NextResponse.json({
      success: true,
      program: bundle.program,
      items: bundle.items,
      pagination: bundle.pagination,
      standalone: bundle.standalone,
    });
  } catch (error) {
    console.error("[motivation] program detail failed", serializeMotivationError(error));
    return jsonMotivationError("Failed to load motivation program.", 500, error);
  }
}

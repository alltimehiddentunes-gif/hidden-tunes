import { NextRequest, NextResponse } from "next/server";

import { buildMotivationHome } from "@/lib/motivationHome";
import { jsonMotivationError, serializeMotivationError } from "@/lib/motivationCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const home = await buildMotivationHome();
    return NextResponse.json({
      success: true,
      items: home.recommended,
      programs: home.featured_programs,
    });
  } catch (error) {
    console.error("[motivation] recommended failed", serializeMotivationError(error));
    return jsonMotivationError("Failed to load recommended motivationals.", 500, error);
  }
}

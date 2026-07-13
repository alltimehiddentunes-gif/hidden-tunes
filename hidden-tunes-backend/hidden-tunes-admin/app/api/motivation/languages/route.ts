import { NextResponse } from "next/server";

import { buildMotivationHome } from "@/lib/motivationHome";
import { jsonMotivationError, serializeMotivationError } from "@/lib/motivationCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const home = await buildMotivationHome();
    return NextResponse.json({ success: true, languages: home.languages });
  } catch (error) {
    console.error("[motivation] languages failed", serializeMotivationError(error));
    return jsonMotivationError("Failed to load motivation languages.", 500, error);
  }
}

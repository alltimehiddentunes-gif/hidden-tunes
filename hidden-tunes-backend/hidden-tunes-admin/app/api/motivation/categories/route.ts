import { NextResponse } from "next/server";

import {
  jsonMotivationError,
  listMotivationCategories,
  serializeMotivationError,
} from "@/lib/motivationCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const categories = await listMotivationCategories();
    return NextResponse.json({ success: true, categories });
  } catch (error) {
    console.error("[motivation] categories failed", serializeMotivationError(error));
    return jsonMotivationError("Failed to load motivation categories.", 500, error);
  }
}

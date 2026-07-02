import { NextResponse } from "next/server";

import { buildTvPublicCategoryCatalog } from "@/lib/tvPublicCategories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const categories = buildTvPublicCategoryCatalog();

  return NextResponse.json({
    success: true,
    categories,
  });
}

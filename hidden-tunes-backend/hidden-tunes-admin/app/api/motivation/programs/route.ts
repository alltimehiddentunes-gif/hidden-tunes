import { NextRequest, NextResponse } from "next/server";

import { jsonMotivationError, serializeMotivationError } from "@/lib/motivationCatalog";
import {
  listMotivationPrograms,
  parseMotivationListParams,
} from "@/lib/motivationPrograms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = parseMotivationListParams(request.nextUrl.searchParams);

  try {
    const result = await listMotivationPrograms(params);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[motivation] programs browse failed", serializeMotivationError(error));
    return jsonMotivationError("Failed to load motivation programs.", 500, error);
  }
}

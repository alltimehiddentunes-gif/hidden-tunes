import { NextResponse } from "next/server";

import {
  jsonMotivationError,
  loadMotivationDetail,
  serializeMotivationError,
} from "@/lib/motivationCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const item = await loadMotivationDetail(id);
    if (!item) return jsonMotivationError("Motivation item not found.", 404);

    return NextResponse.json({
      success: true,
      item,
    });
  } catch (error) {
    console.error("[motivation] detail failed", serializeMotivationError(error));
    return jsonMotivationError("Failed to load motivation item.", 500, error);
  }
}

import { NextResponse } from "next/server";

import { jsonAudiobookError, loadAudiobookDetail } from "@/lib/audiobookCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const detail = await loadAudiobookDetail(id, true);
    if (!detail) return jsonAudiobookError("Mature audiobook not found.", 404);

    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error.";
    return jsonAudiobookError("Failed to load mature audiobook.", 500, message);
  }
}

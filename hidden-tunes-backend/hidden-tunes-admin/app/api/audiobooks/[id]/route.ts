import { NextResponse } from "next/server";

import {
  jsonAudiobookError,
  loadAudiobookDetail,
  logAudiobookError,
} from "@/lib/audiobookCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const detail = await loadAudiobookDetail(id, false);
    if (!detail) return jsonAudiobookError("Audiobook not found.", 404);

    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    logAudiobookError("Failed to load audiobook.", error);
    return jsonAudiobookError("Failed to load audiobook.", 500, error);
  }
}

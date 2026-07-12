import { NextRequest, NextResponse } from "next/server";

import {
  jsonMotivationError,
  resolveMotivationPlayback,
} from "@/lib/motivationCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const result = await resolveMotivationPlayback(String(id || ""));

  if (!result.ok) {
    return jsonMotivationError(result.error, result.status);
  }

  return NextResponse.json({
    success: true,
    id: result.id,
    source_type: result.source_type,
    source_id: result.source_id,
    media_type: result.media_type,
    stream_url: result.stream_url,
    embed_url: result.embed_url,
  });
}

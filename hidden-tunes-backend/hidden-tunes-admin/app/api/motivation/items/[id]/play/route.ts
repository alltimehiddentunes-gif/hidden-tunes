import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MOTIVATION_PLAY_SELECT } from "@/lib/motivationCatalog";
import { isPublicMotivationRow } from "@/lib/motivationHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      success: false,
      error,
      details: details || null,
    },
    { status }
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const cleanId = String(id || "").trim();

  if (!cleanId) {
    return jsonError("Motivation item id is required.", 400);
  }

  const { data, error } = await supabaseAdmin
    .from("motivation_items")
    .select(MOTIVATION_PLAY_SELECT)
    .eq("id", cleanId)
    .maybeSingle();

  if (error) {
    return jsonError("Failed to load motivation play URL.", 500, error.message);
  }

  if (!data || !isPublicMotivationRow(data)) {
    return jsonError("Motivation item not found or not currently playable.", 404);
  }

  return NextResponse.json({
    success: true,
    id: data.id,
    source_type: data.source_type,
    source_id: data.source_id,
    stream_url: data.source_url,
    embed_url: data.embed_url || null,
  });
}

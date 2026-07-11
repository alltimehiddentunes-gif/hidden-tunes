import { NextRequest, NextResponse } from "next/server";

import {
  RADIO_PLAY_STATION_SELECT,
  isPublicRadioRow,
  jsonRadioError,
} from "@/lib/radioPublicCatalog";
import { validatePublicRadioStreamUrl } from "@/lib/radioStreamVerification";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const cleanId = String(id || "").trim();

  if (!cleanId) {
    return jsonRadioError("Radio station id is required.", 400);
  }

  const { data, error } = await supabaseAdmin
    .from("radio_stations")
    .select(RADIO_PLAY_STATION_SELECT)
    .eq("id", cleanId)
    .maybeSingle();

  if (error) {
    return jsonRadioError("Failed to load radio play URL.", 500, error.message);
  }

  if (!data || !isPublicRadioRow(data)) {
    return jsonRadioError("Radio station not found or not currently playable.", 404);
  }

  const streamUrl = String(data.stream_url || "").trim();
  const validation = validatePublicRadioStreamUrl(streamUrl);
  if (!validation.ok) {
    return jsonRadioError("Radio station is not currently playable.", 404);
  }

  return NextResponse.json({
    success: true,
    id: data.id,
    source_type: data.source_type,
    source_station_uuid: data.source_station_uuid,
    stream_url: validation.url,
  });
}

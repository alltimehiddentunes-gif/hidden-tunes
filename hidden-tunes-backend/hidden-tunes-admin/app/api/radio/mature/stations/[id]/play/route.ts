import { NextRequest, NextResponse } from "next/server";

import {
  RADIO_PLAY_STATION_SELECT,
  jsonRadioError,
} from "@/lib/radioPublicCatalog";
import {
  isPublicMatureRadioRow,
  parseMatureRadioAccess,
} from "@/lib/radioMature/platformPolicy";
import { recordRadioBrowserStationClick } from "@/lib/radioMature/radioBrowserClick";
import { resolveRadioPlayStreamUrl } from "@/lib/radioRelay/resolvePlayUrl";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!parseMatureRadioAccess(request)) {
    return jsonRadioError("Mature radio playback requires age confirmation.", 403);
  }

  const { id } = await context.params;
  const cleanId = String(id || "").trim();
  if (!cleanId) return jsonRadioError("Radio station id is required.", 400);

  const { data, error } = await supabaseAdmin
    .from("radio_stations")
    .select(RADIO_PLAY_STATION_SELECT)
    .eq("id", cleanId)
    .maybeSingle();

  if (error) return jsonRadioError("Failed to load mature radio play URL.", 500, error.message);
  if (!data || !isPublicMatureRadioRow(data as Record<string, unknown>)) {
    return jsonRadioError("Mature radio station not found or not currently playable.", 404);
  }

  const resolved = await resolveRadioPlayStreamUrl({
    stationId: cleanId,
    streamUrl: String(data.stream_url || ""),
  });

  if (resolved.kind === "unavailable") {
    return jsonRadioError("Mature radio station is not currently playable.", 404);
  }

  if (data.source_type === "radio_browser" && data.source_station_uuid) {
    await recordRadioBrowserStationClick({
      stationUuid: String(data.source_station_uuid),
    }).catch(() => undefined);
  }

  return NextResponse.json({
    success: true,
    id: data.id,
    source_type: data.source_type,
    source_station_uuid: data.source_station_uuid,
    stream_url: resolved.streamUrl,
    delivery: resolved.kind === "relay_http" ? "relay" : "direct",
    mature: true,
  });
}

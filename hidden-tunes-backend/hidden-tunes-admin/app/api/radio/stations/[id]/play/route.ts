import { NextRequest, NextResponse } from "next/server";

import {
  RADIO_PLAY_STATION_SELECT,
  isPublicRadioRow,
  jsonRadioError,
} from "@/lib/radioPublicCatalog";
import { isPublicMatureRadioRow } from "@/lib/radioMature/platformPolicy";
import { recordRadioBrowserStationClick } from "@/lib/radioMature/radioBrowserClick";
import { resolveRadioPlayStreamUrl } from "@/lib/radioRelay/resolvePlayUrl";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
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

  if (!data) {
    return jsonRadioError("Radio station not found or not currently playable.", 404);
  }

  if (data.is_mature === true) {
    // Public-eligible mature stations are playable without query-param age gates.
    // Frozen mobile /play does not send mature_enabled/age_confirmed; consent is
    // enforced client-side before mature rows are shown in search.
    if (!isPublicMatureRadioRow(data as Record<string, unknown>)) {
      return jsonRadioError("Radio station not found or not currently playable.", 404);
    }
  } else if (!isPublicRadioRow(data as Record<string, unknown>)) {
    return jsonRadioError("Radio station not found or not currently playable.", 404);
  }

  const resolved = await resolveRadioPlayStreamUrl({
    stationId: cleanId,
    streamUrl: String(data.stream_url || ""),
  });

  if (resolved.kind === "unavailable") {
    return jsonRadioError("Radio station is not currently playable.", 404);
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
  });
}

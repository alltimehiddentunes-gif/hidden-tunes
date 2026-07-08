import { NextRequest, NextResponse } from "next/server";

import { RADIO_PLAY_STATION_SELECT, jsonRadioError } from "@/lib/radioCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanHttpsUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

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
    .eq("status", "approved")
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return jsonRadioError("Failed to load radio play URL.", 500, error.message);
  }

  const streamUrl = cleanHttpsUrl(data?.stream_url);
  if (!data || !streamUrl) {
    return jsonRadioError("Radio station not found or not currently playable.", 404);
  }

  return NextResponse.json({
    success: true,
    id: data.id,
    stream_url: streamUrl,
  });
}

import { NextRequest, NextResponse } from "next/server";

import {
  RADIO_PUBLIC_STATION_SELECT,
  jsonRadioError,
  toRadioPublicStation,
} from "@/lib/radioPublicCatalog";
import {
  applyMatureRadioPublicFilters,
  isPublicMatureRadioRow,
  parseMatureRadioAccess,
} from "@/lib/radioMature/platformPolicy";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!parseMatureRadioAccess(request)) {
    return jsonRadioError("Mature radio requires age confirmation.", 403);
  }

  const { id } = await context.params;
  const cleanId = String(id || "").trim();
  if (!cleanId) return jsonRadioError("Radio station id is required.", 400);

  let query = supabaseAdmin
    .from("radio_stations")
    .select(RADIO_PUBLIC_STATION_SELECT)
    .eq("id", cleanId);

  query = applyMatureRadioPublicFilters(query);
  const { data, error } = await query.maybeSingle();

  if (error) return jsonRadioError("Failed to load mature radio station.", 500, error.message);
  if (!data || !isPublicMatureRadioRow(data as Record<string, unknown>)) {
    return jsonRadioError("Mature radio station not found.", 404);
  }

  return NextResponse.json({
    success: true,
    station: toRadioPublicStation(data as Record<string, unknown>),
  });
}

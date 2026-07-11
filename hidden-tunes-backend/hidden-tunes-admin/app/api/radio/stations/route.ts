import { NextRequest, NextResponse } from "next/server";

import {
  RADIO_PUBLIC_STATION_SELECT,
  applyPublicRadioFilters,
  buildRadioPagination,
  jsonRadioError,
  parseRadioBoolean,
  parseRadioLimit,
  parseRadioPage,
  toRadioPublicStation,
} from "@/lib/radioPublicCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = parseRadioPage(params.get("page"));
  const limit = parseRadioLimit(params.get("limit"));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from("radio_stations")
    .select(RADIO_PUBLIC_STATION_SELECT, { count: "exact" })
    .order("reliability_score", { ascending: false })
    .order("created_at", { ascending: false });

  query = applyPublicRadioFilters(query, {
    category: params.get("category"),
    country: params.get("country"),
    language: params.get("language"),
    featured: parseRadioBoolean(params.get("featured")),
    includeMature: parseRadioBoolean(
      params.get("includeMature") || params.get("include_mature")
    ),
    searchQuery: params.get("q"),
  });

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return jsonRadioError("Failed to load public radio stations.", 500, error.message);
  }

  const total = count || 0;
  const stations = ((data || []) as Record<string, unknown>[]).map((row) =>
    toRadioPublicStation(row)
  );

  return NextResponse.json({
    success: true,
    stations,
    pagination: buildRadioPagination(page, limit, total),
  });
}

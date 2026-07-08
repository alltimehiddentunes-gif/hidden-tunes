import { NextRequest, NextResponse } from "next/server";

import {
  RADIO_PUBLIC_STATION_SELECT,
  buildRadioPagination,
  cleanRadioFilter,
  jsonRadioError,
  parseRadioLimit,
  parseRadioPage,
  toRadioPublicStation,
} from "@/lib/radioCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = cleanRadioFilter(params.get("q"), 120);
  const page = parseRadioPage(params.get("page"));
  const limit = parseRadioLimit(params.get("limit"));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  if (!q) {
    return NextResponse.json({
      success: true,
      stations: [],
      pagination: buildRadioPagination(page, limit, 0),
    });
  }

  const escaped = q.replace(/[%_]/g, "\\$&");
  const { data, error, count } = await supabaseAdmin
    .from("radio_stations")
    .select(RADIO_PUBLIC_STATION_SELECT, { count: "exact" })
    .eq("status", "approved")
    .eq("is_active", true)
    .or(
      `name.ilike.%${escaped}%,country.ilike.%${escaped}%,country_code.ilike.%${escaped}%,language.ilike.%${escaped}%,category_slug.ilike.%${escaped}%`
    )
    .order("quality_score", { ascending: false })
    .order("votes", { ascending: false })
    .order("click_count", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return jsonRadioError("Failed to search public radio catalog.", 500, error.message);
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

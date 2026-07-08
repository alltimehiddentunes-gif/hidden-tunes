import { NextRequest, NextResponse } from "next/server";

import {
  RADIO_PUBLIC_STATION_SELECT,
  buildRadioPagination,
  cleanRadioFilter,
  cleanRadioToken,
  jsonRadioError,
  parseRadioBoolean,
  parseRadioLimit,
  parseRadioPage,
  toRadioPublicStation,
} from "@/lib/radioCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = parseRadioPage(params.get("page"));
  const limit = parseRadioLimit(params.get("limit"));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const category = cleanRadioToken(params.get("category"));
  const country = cleanRadioFilter(params.get("country"), 8)?.toUpperCase();
  const featuredOnly = parseRadioBoolean(params.get("featured"));

  let query = supabaseAdmin
    .from("radio_stations")
    .select(RADIO_PUBLIC_STATION_SELECT, { count: "exact" })
    .eq("status", "approved")
    .eq("is_active", true)
    .order("quality_score", { ascending: false })
    .order("votes", { ascending: false })
    .order("click_count", { ascending: false })
    .order("created_at", { ascending: false });

  if (featuredOnly) query = query.eq("is_featured", true);
  if (country) query = query.eq("country_code", country);
  if (category && !["trending", "popular", "recommended"].includes(category)) {
    query = query.or(
      `category_slug.eq.${category},categories.cs.{${category}},tags.cs.{${category}}`
    );
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return jsonRadioError("Failed to load public radio catalog.", 500, error.message);
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

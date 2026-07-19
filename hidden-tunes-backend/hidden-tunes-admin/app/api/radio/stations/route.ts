import { NextRequest, NextResponse } from "next/server";

import {
  RADIO_PUBLIC_STATION_SELECT,
  RADIO_PUBLIC_STATION_SELECT_WITH_STREAM,
  applyPublicRadioFilters,
  buildRadioPagination,
  jsonRadioError,
  parseRadioBoolean,
  parseRadioLimit,
  parseRadioPage,
  toRadioPublicStation,
} from "@/lib/radioPublicCatalog";
import { parseMatureRadioAccess } from "@/lib/radioMature/platformPolicy";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = parseRadioPage(params.get("page"));
  const limit = parseRadioLimit(params.get("limit"));
  const includeMature = parseRadioBoolean(
    params.get("includeMature") || params.get("include_mature")
  );
  if (includeMature && !parseMatureRadioAccess(request)) {
    return jsonRadioError("Mature radio requires age confirmation.", 403);
  }

  const includeStream = Boolean(
    parseRadioBoolean(params.get("include_stream") || params.get("includeStream"))
  );
  const httpsOnly = Boolean(
    parseRadioBoolean(params.get("https_only") || params.get("httpsOnly"))
  );

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const select = includeStream
    ? RADIO_PUBLIC_STATION_SELECT_WITH_STREAM
    : RADIO_PUBLIC_STATION_SELECT;

  let query = supabaseAdmin
    .from("radio_stations")
    .select(select, { count: "exact" })
    .order("reliability_score", { ascending: false })
    .order("created_at", { ascending: false });

  query = applyPublicRadioFilters(query, {
    category: params.get("category"),
    country: params.get("country"),
    language: params.get("language"),
    featured: parseRadioBoolean(params.get("featured")),
    includeMature: includeMature && parseMatureRadioAccess(request),
    searchQuery: params.get("q"),
    httpsOnly,
  });

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return jsonRadioError("Failed to load public radio stations.", 500, error.message);
  }

  const total = count || 0;
  const stations = ((data || []) as unknown as Record<string, unknown>[]).map((row) =>
    toRadioPublicStation(row, { includeStream })
  );

  return NextResponse.json({
    success: true,
    stations,
    pagination: buildRadioPagination(page, limit, total),
  });
}

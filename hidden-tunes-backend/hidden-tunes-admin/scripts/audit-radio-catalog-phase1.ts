/**
 * Phase 1 read-only radio catalog audit. Does not import or mutate data.
 */
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { fetchProductionPublicCount } from "@/lib/radioExpansion25k/publicCounts";
import { RADIO_PUBLIC_RELIABILITY_THRESHOLD } from "@/lib/radioPublicCatalog";

type CountFilter =
  | { op: "eq"; column: string; value: string | number | boolean }
  | { op: "gte"; column: string; value: number }
  | { op: "lt"; column: string; value: number }
  | { op: "ilike"; column: string; value: string }
  | { op: "is"; column: string; value: null }
  | { op: "not_is"; column: string; value: null }
  | { op: "or"; value: string }
  | { op: "neq"; column: string; value: string | number | boolean };

async function countRows(supabase: SupabaseClient, filters: CountFilter[] = []) {
  let query = supabase.from("radio_stations").select("id", { count: "exact", head: true });
  for (const filter of filters) {
    if (filter.op === "eq") query = query.eq(filter.column, filter.value);
    else if (filter.op === "gte") query = query.gte(filter.column, filter.value);
    else if (filter.op === "lt") query = query.lt(filter.column, filter.value);
    else if (filter.op === "ilike") query = query.ilike(filter.column, filter.value);
    else if (filter.op === "is") query = query.is(filter.column, filter.value);
    else if (filter.op === "not_is") query = query.not(filter.column, "is", filter.value);
    else if (filter.op === "neq") query = query.neq(filter.column, filter.value);
    else query = query.or(filter.value);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

const publicFilters: CountFilter[] = [
  { op: "eq", column: "status", value: "approved" },
  { op: "eq", column: "is_active", value: true },
  { op: "eq", column: "is_verified", value: true },
  { op: "eq", column: "playback_status", value: "playable" },
  { op: "eq", column: "is_mature", value: false },
  { op: "is", column: "quarantined_at", value: null },
  { op: "is", column: "disabled_at", value: null },
  { op: "gte", column: "reliability_score", value: RADIO_PUBLIC_RELIABILITY_THRESHOLD },
];

async function sampleDistinct(
  supabase: SupabaseClient,
  column: "normalized_stream_url" | "station_fingerprint" | "normalized_name",
  limit = 50_000
) {
  const values = new Set<string>();
  let from = 0;
  const pageSize = 1000;
  while (from < limit) {
    const to = Math.min(from + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from("radio_stations")
      .select(column)
      .not(column, "is", null)
      .neq(column, "")
      .range(from, to);
    if (error) throw error;
    const rows = data || [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const value = String((row as Record<string, unknown>)[column] || "").trim();
      if (value) values.add(value);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return values.size;
}

async function estimateDuplicateGroups(supabase: SupabaseClient) {
  // Page through fingerprints and count groups with size > 1 via client aggregation sample.
  const counts = new Map<string, number>();
  let from = 0;
  const pageSize = 1000;
  const maxRows = 40_000;
  while (from < maxRows) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await supabase
      .from("radio_stations")
      .select("station_fingerprint")
      .not("station_fingerprint", "is", null)
      .neq("station_fingerprint", "")
      .range(from, to);
    if (error) throw error;
    const rows = data || [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const fp = String(row.station_fingerprint || "");
      if (!fp) continue;
      counts.set(fp, (counts.get(fp) || 0) + 1);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  let duplicateGroups = 0;
  let duplicateRows = 0;
  for (const size of counts.values()) {
    if (size > 1) {
      duplicateGroups += 1;
      duplicateRows += size;
    }
  }
  return {
    sampled_rows: Math.min(from + pageSize, maxRows),
    unique_fingerprints_sampled: counts.size,
    duplicate_groups: duplicateGroups,
    duplicate_rows: duplicateRows,
  };
}

async function main() {
  const adminRoot = path.resolve(__dirname, "..");
  loadAdminEnv(adminRoot);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables.");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const productionApiBase = "https://admin.hiddentunes.com";
  const productionPublic = await fetchProductionPublicCount(productionApiBase);

  const [
    total,
    verified,
    publicGeneral,
    publicMature,
    playable,
    httpsDirect,
    httpStreams,
    hlsLikely,
    recentlyFailed,
    quarantined,
    missingCountry,
    missingState,
    missingLanguage,
    missingArtwork,
    uniqueNormalizedName,
    uniqueNormalizedUrl,
    uniqueFingerprint,
  ] = await Promise.all([
    countRows(supabase),
    countRows(supabase, [{ op: "eq", column: "is_verified", value: true }]),
    countRows(supabase, publicFilters),
    countRows(supabase, [
      ...publicFilters.filter((f) => !(f.op === "eq" && f.column === "is_mature")),
      { op: "eq", column: "is_mature", value: true },
    ]),
    countRows(supabase, [{ op: "eq", column: "playback_status", value: "playable" }]),
    countRows(supabase, [{ op: "ilike", column: "stream_url", value: "https://%" }]),
    countRows(supabase, [{ op: "ilike", column: "stream_url", value: "http://%" }]),
    countRows(supabase, [
      {
        op: "or",
        value:
          "stream_url.ilike.%.m3u8%,codec.ilike.%hls%,codec.ilike.%m3u8%,tags.cs.{hls}",
      },
    ]),
    countRows(supabase, [
      { op: "eq", column: "playback_status", value: "failed" },
      { op: "gte", column: "last_health_checked_at", value: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() },
    ]),
    countRows(supabase, [{ op: "not_is", column: "quarantined_at", value: null }]),
    countRows(supabase, [
      { op: "or", value: "country_code.is.null,country_code.eq.,country.is.null,country.eq." },
    ]),
    countRows(supabase, [{ op: "or", value: "state.is.null,state.eq." }]),
    countRows(supabase, [{ op: "or", value: "language.is.null,language.eq." }]),
    countRows(supabase, [{ op: "or", value: "favicon_url.is.null,favicon_url.eq." }]),
    sampleDistinct(supabase, "normalized_name"),
    sampleDistinct(supabase, "normalized_stream_url"),
    sampleDistinct(supabase, "station_fingerprint"),
  ]);

  // City column may not exist — probe safely.
  let missingCity: number | string = "column_absent";
  {
    const probe = await supabase.from("radio_stations").select("city").limit(1);
    if (!probe.error) {
      missingCity = await countRows(supabase, [{ op: "or", value: "city.is.null,city.eq." }]);
    } else {
      missingCity = `unavailable: ${probe.error.message}`;
    }
  }

  const duplicateEstimate = await estimateDuplicateGroups(supabase);

  // HTTP stations that are otherwise public-eligible (relay candidates).
  const publicHttpRelayCandidates = await countRows(supabase, [
    ...publicFilters,
    { op: "ilike", column: "stream_url", value: "http://%" },
  ]);
  const publicHttpsDirect = await countRows(supabase, [
    ...publicFilters,
    { op: "ilike", column: "stream_url", value: "https://%" },
  ]);

  const report = {
    audited_at: new Date().toISOString(),
    production_api_base: productionApiBase,
    production_public_stations: productionPublic,
    target_requested: 40_000,
    current_target_in_code: 25_000,
    remaining_gap_to_40k: Math.max(0, 40_000 - productionPublic),
    counts: {
      "1_total_rows": total,
      "2_unique_normalized_stations_approx": {
        by_fingerprint_sampled: uniqueFingerprint,
        by_normalized_name_sampled: uniqueNormalizedName,
        by_normalized_stream_url_sampled: uniqueNormalizedUrl,
        note: "Sampled up to 50k rows via PostgREST pagination; exact unique may be slightly higher if catalog exceeds sample.",
      },
      "3_verified_stations": verified,
      "4_public_stations": {
        general: publicGeneral,
        mature: publicMature,
        production_api: productionPublic,
      },
      "5_currently_playable_stations": playable,
      "6_https_direct_stations": httpsDirect,
      "6b_public_https_direct": publicHttpsDirect,
      "7_http_stations_relay_candidates": {
        all_http_stream_rows: httpStreams,
        public_eligible_http: publicHttpRelayCandidates,
      },
      "8_hls_stations_heuristic": hlsLikely,
      "9_recently_failed_stations_14d": recentlyFailed,
      "10_quarantined_stations": quarantined,
      "11_missing_country": missingCountry,
      "12_missing_region_state": missingState,
      "13_missing_city": missingCity,
      "14_missing_language": missingLanguage,
      "15_missing_artwork": missingArtwork,
      "16_duplicate_groups": duplicateEstimate,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

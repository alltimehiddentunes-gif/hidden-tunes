import type { SupabaseClient } from "@supabase/supabase-js";

export const RADIO_PUBLIC_PLAYABLE_TARGET = 40_000;

type CountFilter =
  | { op: "eq"; column: string; value: string | number | boolean }
  | { op: "gte"; column: string; value: number }
  | { op: "is"; column: string; value: null }
  | { op: "not_is"; column: string; value: null };

async function countRows(supabase: SupabaseClient, filters: CountFilter[] = []) {
  let query = supabase.from("radio_stations").select("id", { count: "exact", head: true });
  for (const filter of filters) {
    if (filter.op === "eq") query = query.eq(filter.column, filter.value);
    else if (filter.op === "gte") query = query.gte(filter.column, filter.value);
    else if (filter.op === "is") query = query.is(filter.column, filter.value);
    else query = query.not(filter.column, "is", filter.value);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

export type RadioCatalogCounts = {
  total: number;
  verified: number;
  playable: number;
  unchecked: number;
  failed: number;
  quarantined: number;
  disabled: number;
  public_general: number;
  public_mature: number;
};

export async function getRadioCatalogCounts(supabase: SupabaseClient): Promise<RadioCatalogCounts> {
  const publicFilters: CountFilter[] = [
    { op: "eq", column: "status", value: "approved" },
    { op: "eq", column: "is_active", value: true },
    { op: "eq", column: "is_verified", value: true },
    { op: "eq", column: "playback_status", value: "playable" },
    { op: "is", column: "quarantined_at", value: null },
    { op: "is", column: "disabled_at", value: null },
    { op: "gte", column: "reliability_score", value: 60 },
  ];

  const [total, verified, playable, unchecked, failed, quarantined, disabled, publicGeneral, publicMature] =
    await Promise.all([
      countRows(supabase),
      countRows(supabase, [{ op: "eq", column: "is_verified", value: true }]),
      countRows(supabase, [{ op: "eq", column: "playback_status", value: "playable" }]),
      countRows(supabase, [{ op: "eq", column: "playback_status", value: "unchecked" }]),
      countRows(supabase, [{ op: "eq", column: "playback_status", value: "failed" }]),
      countRows(supabase, [{ op: "not_is", column: "quarantined_at", value: null }]),
      countRows(supabase, [{ op: "not_is", column: "disabled_at", value: null }]),
      countRows(supabase, [...publicFilters, { op: "eq", column: "is_mature", value: false }]),
      countRows(supabase, [...publicFilters, { op: "eq", column: "is_mature", value: true }]),
    ]);

  return {
    total,
    verified,
    playable,
    unchecked,
    failed,
    quarantined,
    disabled,
    public_general: publicGeneral,
    public_mature: publicMature,
  };
}

export async function fetchProductionPublicCount(apiBase = "https://admin.hiddentunes.com") {
  const response = await fetch(`${apiBase}/api/radio/stations?limit=1&page=1`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`production_public_count_${response.status}`);
  }
  const json = (await response.json()) as { pagination?: { total?: number } };
  return Number(json.pagination?.total || 0);
}

export function remainingPublicPlayableGap(publicGeneral: number) {
  return Math.max(0, RADIO_PUBLIC_PLAYABLE_TARGET - publicGeneral);
}

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  applyTvPublicCatalogFilters,
  isTvMatureColumnEnabled,
  type SupabaseFilterQuery,
} from "@/lib/tvPlatformPolicy";

export type TvPlatformEligibleCounts = {
  normalPlatformEligible: number;
  maturePlatformEligible: number;
  combinedPlatformEligible: number;
};

async function countEligible(includeMature: boolean) {
  let query = supabaseAdmin
    .from("tv_videos")
    .select("id", { count: "exact", head: true }) as unknown as SupabaseFilterQuery;

  applyTvPublicCatalogFilters(query, "cross", new Date(), { includeMature });

  const { count, error } = await query.range(0, 0);
  if (error) {
    throw new Error(error.message || `platform count query failed (${includeMature ? "mature" : "normal"})`);
  }
  return count ?? 0;
}

/**
 * Accurate platform-eligible counts using the same filters as the public TV API.
 */
export async function getTvPlatformEligibleCounts(): Promise<TvPlatformEligibleCounts> {
  const normalPlatformEligible = await countEligible(false);
  const maturePlatformEligible = isTvMatureColumnEnabled()
    ? await countEligible(true)
    : 0;

  return {
    normalPlatformEligible,
    maturePlatformEligible,
    combinedPlatformEligible: normalPlatformEligible + maturePlatformEligible,
  };
}

/** Backward-compatible normal-only eligible count. */
export async function getTvPlatformEligibleCount() {
  const counts = await getTvPlatformEligibleCounts();
  return counts.normalPlatformEligible;
}

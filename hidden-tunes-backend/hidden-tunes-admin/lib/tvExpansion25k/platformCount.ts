import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  applyTvPublicCatalogFilters,
  type SupabaseFilterQuery,
} from "@/lib/tvPlatformPolicy";

/**
 * Accurate platform-eligible count using the same filters as the public TV API.
 * Additive helper for expansion reporting — does not modify existing health summary.
 */
export async function getTvPlatformEligibleCount() {
  let query = supabaseAdmin
    .from("tv_videos")
    .select("id", { count: "exact", head: true }) as unknown as SupabaseFilterQuery;

  applyTvPublicCatalogFilters(query, "cross");

  const { count, error } = await query.range(0, 0);
  if (error) throw new Error(error.message);

  return count ?? 0;
}

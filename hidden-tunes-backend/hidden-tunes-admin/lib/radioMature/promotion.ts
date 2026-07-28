import type { SupabaseClient } from "@supabase/supabase-js";

import { RADIO_PUBLIC_RELIABILITY_THRESHOLD } from "@/lib/radioPublicCatalog";

export type MaturePromotionResult = {
  scanned: number;
  promoted: number;
  skipped: number;
  errors: number;
};

export async function promoteEligibleMatureRadioStations(
  supabase: SupabaseClient,
  options: { dryRun: boolean; limit?: number | null } = { dryRun: false }
): Promise<MaturePromotionResult> {
  const result: MaturePromotionResult = {
    scanned: 0,
    promoted: 0,
    skipped: 0,
    errors: 0,
  };

  let query = supabase
    .from("radio_stations")
    .select(
      "id, playback_status, is_verified, reliability_score, mature_review_status, rights_status, mature_source_approved, quarantined_at, disabled_at, requires_payment, requires_drm, is_free"
    )
    .eq("is_mature", true)
    .eq("mature_review_status", "confirmed")
    .eq("rights_status", "approved")
    .eq("mature_source_approved", false)
    .eq("playback_status", "playable")
    .eq("is_verified", true)
    .gte("reliability_score", RADIO_PUBLIC_RELIABILITY_THRESHOLD)
    .is("quarantined_at", null)
    .is("disabled_at", null)
    .eq("is_free", true)
    .eq("requires_payment", false)
    .eq("requires_drm", false);

  if (options.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  for (const row of data || []) {
    result.scanned += 1;
    if (options.dryRun) {
      result.promoted += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("radio_stations")
      .update({
        mature_source_approved: true,
        // Normalize legacy "18+" ratings so frozen mobile content_rating checks work.
        content_rating: "adult",
        mature_reviewed_at: new Date().toISOString(),
        mature_reviewed_by: "radio-mature-promotion",
      })
      .eq("id", row.id);
    if (updateError) result.errors += 1;
    else result.promoted += 1;
  }

  result.skipped = Math.max(0, result.scanned - result.promoted - result.errors);
  return result;
}

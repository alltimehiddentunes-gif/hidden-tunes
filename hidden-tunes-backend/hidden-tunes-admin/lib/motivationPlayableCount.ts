import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { MOTIVATION_TARGET_ITEMS } from "@/lib/motivationCatalog";

export type PlayablePendingCountResult = {
  total_playable_legal_pending: number;
  target_items: number;
  gap_to_target: number;
};

/**
 * Count pending Motivationals that already passed lightweight rights + media checks.
 * Uses an exact head count to avoid PostgREST Bad Request on giant .in() lists.
 */
export async function countPlayableLegalPendingMotivationItems(
  targetItems = MOTIVATION_TARGET_ITEMS
): Promise<PlayablePendingCountResult> {
  const { count, error } = await supabaseAdmin
    .from("motivation_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("playback_status", "playable")
    .eq("rights_status", "passed")
    .eq("media_probe_status", "passed");

  if (error) throw new Error(error.message);

  const total = Number(count || 0);
  return {
    total_playable_legal_pending: total,
    target_items: targetItems,
    gap_to_target: Math.max(0, targetItems - total),
  };
}

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { MOTIVATION_TARGET_ITEMS } from "@/lib/motivationCatalog";

export type PlayablePendingCountResult = {
  total_playable_legal_pending: number;
  target_items: number;
  gap_to_target: number;
};

/**
 * Count unique pending Motivationals that have verified direct playable media and passed rights.
 * This is the 200k ingestion stop metric — not raw row count or discovery-only candidates.
 */
export async function countPlayableLegalPendingMotivationItems(
  targetItems = MOTIVATION_TARGET_ITEMS
): Promise<PlayablePendingCountResult> {
  const { data: items, error: itemsError } = await supabaseAdmin
    .from("motivation_items")
    .select("id")
    .eq("status", "pending")
    .eq("playback_status", "playable")
    .eq("rights_status", "passed")
    .eq("media_probe_status", "passed");

  if (itemsError) throw new Error(itemsError.message);

  const itemIds = (items || []).map((row) => String(row.id)).filter(Boolean);
  if (itemIds.length === 0) {
    return {
      total_playable_legal_pending: 0,
      target_items: targetItems,
      gap_to_target: targetItems,
    };
  }

  const { data: files, error: filesError } = await supabaseAdmin
    .from("motivation_files")
    .select("item_id, audio_url, video_url, mime_type, is_primary")
    .in("item_id", itemIds)
    .eq("is_primary", true);

  if (filesError) throw new Error(filesError.message);

  const unique = new Set<string>();
  for (const file of (files || []) as Array<Record<string, unknown>>) {
    const mime = String(file.mime_type || "").toLowerCase();
    if (mime.includes("text/html")) continue;
    const mediaUrl = String(file.video_url || file.audio_url || "").trim();
    if (!mediaUrl) continue;
    unique.add(String(file.item_id));
  }

  const total = unique.size;
  return {
    total_playable_legal_pending: total,
    target_items: targetItems,
    gap_to_target: Math.max(0, targetItems - total),
  };
}

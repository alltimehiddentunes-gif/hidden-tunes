import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AUDIOBOOK_EXPANSION_TARGET } from "@/lib/audiobookExpansionConstants";

export type AudiobookStatusSummary = {
  totalEditions: number;
  publicPlayableEditions: number;
  completeEditions: number;
  partialEditions: number;
  playableChapters: number;
  uniqueWorks: number;
  languages: number;
  categories: number;
  sources: number;
  rejectedCandidates: number;
  gapToTarget: number;
};

export async function getAudiobookStatusSummary(): Promise<AudiobookStatusSummary> {
  const [
    totalEditions,
    publicPlayable,
    completeEditions,
    partialEditions,
    playableChapters,
    uniqueWorks,
    languages,
    categories,
    sources,
    rejectedCandidates,
  ] = await Promise.all([
    countTable("audiobooks"),
    countPublicPlayableEditions(),
    countEditionsByCompleteness("complete"),
    countEditionsByCompleteness("partial"),
    countPlayableChapters(),
    countTable("audiobook_works"),
    countDistinctLanguages(),
    countDistinctCategories(),
    countDistinctSources(),
    countTable("audiobook_rejected_candidates"),
  ]);

  return {
    totalEditions,
    publicPlayableEditions: publicPlayable,
    completeEditions,
    partialEditions,
    playableChapters,
    uniqueWorks,
    languages,
    categories,
    sources,
    rejectedCandidates,
    gapToTarget: Math.max(0, AUDIOBOOK_EXPANSION_TARGET - publicPlayable),
  };
}

async function countTable(table: string) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}

async function countPublicPlayableEditions() {
  const { count, error } = await supabaseAdmin
    .from("audiobooks")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .eq("is_mature", false);
  if (error) throw error;
  return count || 0;
}

async function countEditionsByCompleteness(value: string) {
  const { count, error } = await supabaseAdmin
    .from("audiobooks")
    .select("id", { count: "exact", head: true })
    .eq("completeness", value)
    .eq("status", "approved")
    .eq("playback_status", "playable");
  if (error) throw error;
  return count || 0;
}

async function countPlayableChapters() {
  const { count, error } = await supabaseAdmin
    .from("audiobook_chapters")
    .select("id", { count: "exact", head: true })
    .eq("is_playable", true);
  if (error) throw error;
  return count || 0;
}

async function countDistinctLanguages() {
  const { data, error } = await supabaseAdmin
    .from("audiobooks")
    .select("language")
    .eq("status", "approved")
    .eq("playback_status", "playable")
    .not("language", "is", null);
  if (error) throw error;
  return new Set((data || []).map((row) => row.language).filter(Boolean)).size;
}

async function countDistinctCategories() {
  const { data, error } = await supabaseAdmin
    .from("audiobooks")
    .select("category_slug")
    .eq("status", "approved")
    .eq("playback_status", "playable")
    .not("category_slug", "is", null);
  if (error) throw error;
  return new Set((data || []).map((row) => row.category_slug).filter(Boolean)).size;
}

async function countDistinctSources() {
  const { data, error } = await supabaseAdmin
    .from("audiobooks")
    .select("source_type")
    .eq("status", "approved")
    .eq("playback_status", "playable")
    .not("source_type", "is", null);
  if (error) throw error;
  return new Set((data || []).map((row) => row.source_type).filter(Boolean)).size;
}

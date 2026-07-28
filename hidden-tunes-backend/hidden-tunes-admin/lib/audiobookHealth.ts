import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  AUDIOBOOK_EXPANSION_TARGET,
  AUDIOBOOK_GENERAL_MILESTONE_TARGET,
  AUDIOBOOK_MATURE_MILESTONE_TARGET,
} from "@/lib/audiobookExpansionConstants";

export type AudiobookStatusSummary = {
  totalEditions: number;
  publicPlayableEditions: number;
  maturePlayableEditions: number;
  completeEditions: number;
  partialEditions: number;
  playableChapters: number;
  uniqueWorks: number;
  languages: number;
  categories: number;
  sources: number;
  rejectedCandidates: number;
  gapToTarget: number;
  gapToGeneralMilestone: number;
  gapToMatureMilestone: number;
  countries: number;
  categoryDistribution: Record<string, number>;
  languageDistribution: Record<string, number>;
};

export async function getAudiobookStatusSummary(): Promise<AudiobookStatusSummary> {
  const [
    totalEditions,
    publicPlayable,
    maturePlayable,
    completeEditions,
    partialEditions,
    playableChapters,
    uniqueWorks,
    languages,
    categories,
    sources,
    rejectedCandidates,
    categoryDistribution,
    languageDistribution,
    countries,
  ] = await Promise.all([
    countTable("audiobooks"),
    countPlayableEditions(false),
    countPlayableEditions(true),
    countEditionsByCompleteness("complete"),
    countEditionsByCompleteness("partial"),
    countPlayableChapters(),
    countTableSafe("audiobook_works"),
    countDistinctField("language"),
    countDistinctField("category_slug"),
    countDistinctField("source_type"),
    countTableSafe("audiobook_rejected_candidates"),
    countGroupedField("category_slug"),
    countGroupedField("language"),
    countDistinctField("country"),
  ]);

  return {
    totalEditions,
    publicPlayableEditions: publicPlayable,
    maturePlayableEditions: maturePlayable,
    completeEditions,
    partialEditions,
    playableChapters,
    uniqueWorks,
    languages,
    categories,
    sources,
    rejectedCandidates,
    gapToTarget: Math.max(0, AUDIOBOOK_EXPANSION_TARGET - publicPlayable),
    gapToGeneralMilestone: Math.max(
      0,
      AUDIOBOOK_GENERAL_MILESTONE_TARGET - publicPlayable
    ),
    gapToMatureMilestone: Math.max(
      0,
      AUDIOBOOK_MATURE_MILESTONE_TARGET - maturePlayable
    ),
    countries,
    categoryDistribution,
    languageDistribution,
  };
}

async function countTable(table: string) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}

async function countTableSafe(table: string) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) return 0;
  return count || 0;
}

async function countPlayableEditions(mature: boolean) {
  const { count, error } = await supabaseAdmin
    .from("audiobooks")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .eq("is_mature", mature);
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
  if (error) return 0;
  return count || 0;
}

async function countPlayableChapters() {
  const { count, error } = await supabaseAdmin
    .from("audiobook_chapters")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (error) throw error;
  return count || 0;
}

async function countDistinctField(field: "language" | "category_slug" | "source_type" | "country") {
  const { data, error } = await supabaseAdmin
    .from("audiobooks")
    .select(field)
    .eq("status", "approved")
    .eq("playback_status", "playable")
    .not(field, "is", null)
    .limit(5000);
  if (error) return 0;
  return new Set((data || []).map((row) => (row as Record<string, unknown>)[field]).filter(Boolean)).size;
}

async function countGroupedField(field: "language" | "category_slug") {
  const { data, error } = await supabaseAdmin
    .from("audiobooks")
    .select(field)
    .eq("status", "approved")
    .eq("playback_status", "playable")
    .not(field, "is", null)
    .limit(5000);
  if (error) return {} as Record<string, number>;
  const distribution: Record<string, number> = {};
  for (const row of data || []) {
    const key = String((row as Record<string, unknown>)[field] || "").trim();
    if (!key) continue;
    distribution[key] = (distribution[key] || 0) + 1;
  }
  return distribution;
}

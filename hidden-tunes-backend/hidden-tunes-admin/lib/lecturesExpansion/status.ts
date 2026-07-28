import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  LECTURE_EXPANSION_TARGET_PLAYABLE_ITEMS,
  LECTURE_EXPANSION_TARGET_PROGRAMS,
} from "@/lib/lecturesExpansion/constants";

function publicProgramFilter(query: any) {
  return query
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_public", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable")
    .eq("playable_status", "playable")
    .eq("is_mature", false);
}

function publicPlayableFileFilter(query: any) {
  return query
    .eq("is_active", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable")
    .eq("playable_status", "playable");
}

async function countTable(table: string, apply?: (query: any) => any) {
  let query = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function countProgramsWithFilter(apply: (query: any) => any) {
  return countTable("lecture_items", (query) => publicProgramFilter(apply(query)));
}

async function countPlayableFilesWithFilter(apply: (query: any) => any) {
  return countTable("lecture_files", (query) => publicPlayableFileFilter(apply(query)));
}

export async function getLectureExpansionCounts(options?: { light?: boolean }) {
  const light = options?.light === true;

  const [publicPrograms, publicPlayableItems, audioItems, videoItems, coachingPrograms] =
    await Promise.all([
      countTable("lecture_items", publicProgramFilter),
      countTable("lecture_files", publicPlayableFileFilter),
      countPlayableFilesWithFilter((q) => q.eq("media_type", "audio")),
      countPlayableFilesWithFilter((q) => q.eq("media_type", "video")),
      countProgramsWithFilter((q) => q.or("category_slug.eq.coaching,categories.cs.{coaching}")),
    ]);

  let pendingItems = 0;
  let rejectedItems = 0;
  let coachingItems = coachingPrograms;
  let coachingAudioCount = 0;
  let coachingVideoCount = 0;

  if (!light) {
    [pendingItems, rejectedItems] = await Promise.all([
      countTable("lecture_items", (q) => q.or("status.eq.pending,import_state.eq.pending_review")),
      countTable("lecture_items", (q) => q.eq("import_state", "rejected")),
    ]);

    coachingItems = 0;
    const pageSize = 80;
    let offset = 0;
    for (;;) {
      const { data, error } = await supabaseAdmin
        .from("lecture_items")
        .select("id")
        .or("category_slug.eq.coaching,categories.cs.{coaching}")
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const batchIds = (data || []).map((row) => row.id);
      if (batchIds.length === 0) break;
      coachingItems += await countPlayableFilesWithFilter((q) => q.in("item_id", batchIds));
      coachingAudioCount += await countPlayableFilesWithFilter((q) =>
        q.in("item_id", batchIds).eq("media_type", "audio")
      );
      coachingVideoCount += await countPlayableFilesWithFilter((q) =>
        q.in("item_id", batchIds).eq("media_type", "video")
      );
      if (batchIds.length < pageSize) break;
      offset += pageSize;
    }
  }

  return {
    public_programs: publicPrograms,
    public_playable_items: publicPlayableItems,
    audio_items: audioItems,
    video_items: videoItems,
    pending_items: pendingItems,
    rejected_items: rejectedItems,
    coaching_programs: coachingPrograms,
    coaching_playable_items: coachingItems,
    coaching_audio_items: coachingAudioCount,
    coaching_video_items: coachingVideoCount,
    gap_programs: Math.max(0, LECTURE_EXPANSION_TARGET_PROGRAMS - publicPrograms),
    gap_playable_items: Math.max(0, LECTURE_EXPANSION_TARGET_PLAYABLE_ITEMS - publicPlayableItems),
  };
}

export function isLectureExpansionTargetMet(counts: Awaited<ReturnType<typeof getLectureExpansionCounts>>) {
  return counts.gap_programs <= 0 && counts.gap_playable_items <= 0;
}

export async function getLectureExpansionDistribution() {
  const { data: programs, error } = await supabaseAdmin
    .from("lecture_items")
    .select("category_slug, language, country, source_type")
    .eq("status", "approved")
    .eq("is_public", true)
    .eq("is_active", true);
  if (error) throw error;

  const categories: Record<string, number> = {};
  const languages: Record<string, number> = {};
  const countries: Record<string, number> = {};
  const sources: Record<string, number> = {};

  for (const row of programs || []) {
    const category = String(row.category_slug || "unknown");
    categories[category] = (categories[category] || 0) + 1;
    const language = String(row.language || "unknown");
    languages[language] = (languages[language] || 0) + 1;
    const country = String(row.country || "unknown");
    countries[country] = (countries[country] || 0) + 1;
    const source = String(row.source_type || "unknown");
    sources[source] = (sources[source] || 0) + 1;
  }

  return { categories, languages, countries, sources };
}

export async function getLectureExpansionStatusReport() {
  const counts = await getLectureExpansionCounts();
  const distribution = await getLectureExpansionDistribution();

  const { data: sourceRows } = await supabaseAdmin
    .from("lecture_sources")
    .select("source_key, is_enabled, last_success_at, last_failure_at, consecutive_failures");

  const { data: checkpointRows } = await supabaseAdmin
    .from("lecture_playable_import_checkpoints")
    .select("source_key, query_family, completed")
    .eq("completed", true);

  const exhaustedSources = new Set((checkpointRows || []).map((row) => String(row.source_key)));

  return {
    generated_at: new Date().toISOString(),
    targets: {
      programs: LECTURE_EXPANSION_TARGET_PROGRAMS,
      playable_items: LECTURE_EXPANSION_TARGET_PLAYABLE_ITEMS,
    },
    counts,
    distribution,
    active_sources: (sourceRows || []).filter((row) => row.is_enabled).length,
    exhausted_sources: exhaustedSources.size,
    failed_sources: (sourceRows || []).filter((row) => Number(row.consecutive_failures || 0) > 3).length,
    top_sources: Object.entries(distribution.sources)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([source, count]) => ({ source, count })),
    top_categories: Object.entries(distribution.categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([category, count]) => ({ category, count })),
    top_countries: Object.entries(distribution.countries)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([country, count]) => ({ country, count })),
    top_languages: Object.entries(distribution.languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([language, count]) => ({ language, count })),
    target_met: isLectureExpansionTargetMet(counts),
  };
}

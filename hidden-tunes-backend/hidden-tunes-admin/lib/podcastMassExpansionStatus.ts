import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type PodcastMassExpansionCounts = {
  standard_shows: number;
  mature_shows: number;
  total_shows: number;
  total_episodes: number;
  public_standard_shows: number;
  public_mature_shows: number;
  public_episodes: number;
  languages: string[];
  categories: string[];
};

async function countShows(filter: { is_mature: boolean; public_only?: boolean }) {
  let query = supabaseAdmin
    .from("podcast_shows")
    .select("id", { count: "exact", head: true })
    .eq("is_mature", filter.is_mature);

  if (filter.public_only) {
    query = query
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("feed_status", "active");
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count || 0;
}

async function countEpisodes() {
  const { count, error } = await supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count || 0;
}

async function countPublicEpisodes() {
  const { count, error } = await supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable");
  if (error) throw new Error(error.message);
  return count || 0;
}

async function sampleDistinctLanguages(limit = 200) {
  const languages = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  while (languages.size < limit) {
    const { data, error } = await supabaseAdmin
      .from("podcast_shows")
      .select("language")
      .not("language", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const lang = String(row.language || "").trim().toLowerCase();
      if (lang) languages.add(lang);
      if (languages.size >= limit) break;
    }
    if ((data || []).length < pageSize) break;
    from += pageSize;
  }

  return Array.from(languages).sort();
}

async function sampleDistinctCategories(limit = 100) {
  const categories = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  while (categories.size < limit) {
    const { data, error } = await supabaseAdmin
      .from("podcast_shows")
      .select("primary_category, categories")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const primary = String(row.primary_category || "").trim().toLowerCase();
      if (primary) categories.add(primary);
      for (const entry of Array.isArray(row.categories) ? row.categories : []) {
        const cat = String(entry || "").trim().toLowerCase();
        if (cat) categories.add(cat);
      }
      if (categories.size >= limit) break;
    }
    if ((data || []).length < pageSize) break;
    from += pageSize;
  }

  return Array.from(categories).sort();
}

export async function getPodcastMassExpansionCounts(): Promise<PodcastMassExpansionCounts> {
  const [
    standard_shows,
    mature_shows,
    total_episodes,
    public_standard_shows,
    public_mature_shows,
    public_episodes,
    languages,
    categories,
  ] = await Promise.all([
    countShows({ is_mature: false }),
    countShows({ is_mature: true }),
    countEpisodes(),
    countShows({ is_mature: false, public_only: true }),
    countShows({ is_mature: true, public_only: true }),
    countPublicEpisodes(),
    sampleDistinctLanguages(),
    sampleDistinctCategories(),
  ]);

  return {
    standard_shows,
    mature_shows,
    total_shows: standard_shows + mature_shows,
    total_episodes,
    public_standard_shows,
    public_mature_shows,
    public_episodes,
    languages,
    categories,
  };
}

export function computeExpansionRemaining(
  counts: PodcastMassExpansionCounts,
  targets: { standard: number; mature: number }
) {
  return {
    standard: Math.max(0, targets.standard - counts.public_standard_shows),
    mature: Math.max(0, targets.mature - counts.public_mature_shows),
    total:
      Math.max(0, targets.standard - counts.public_standard_shows) +
      Math.max(0, targets.mature - counts.public_mature_shows),
  };
}

export function isExpansionTargetMet(
  counts: PodcastMassExpansionCounts,
  targets: { standard: number; mature: number }
) {
  return (
    counts.public_standard_shows >= targets.standard &&
    counts.public_mature_shows >= targets.mature
  );
}

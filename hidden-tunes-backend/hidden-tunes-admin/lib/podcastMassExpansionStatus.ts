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

function supabaseErrorMessage(error: { message?: string; code?: string; details?: string; hint?: string } | null) {
  if (!error) return "unknown_supabase_error";
  const parts = [error.message, error.code, error.details, error.hint].filter(
    (part) => typeof part === "string" && part.trim().length > 0
  );
  if (parts.length > 0) return parts.join(" | ");
  try {
    return `unknown_supabase_error:${JSON.stringify(error)}`;
  } catch {
    return "unknown_supabase_error";
  }
}

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
  if (error) throw new Error(supabaseErrorMessage(error));
  return count || 0;
}

async function countEpisodes() {
  const { count, error } = await supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(supabaseErrorMessage(error));
  return count || 0;
}

async function countPublicEpisodes() {
  const { count, error } = await supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable");
  if (error) throw new Error(supabaseErrorMessage(error));
  return count || 0;
}

async function softCount(label: string, fn: () => Promise<number>) {
  try {
    return await fn();
  } catch (error) {
    console.warn(
      `[podcastMassExpansionStatus] ${label} failed:`,
      error instanceof Error ? error.message : String(error)
    );
    return 0;
  }
}

async function countShowsWithRetry(
  filter: { is_mature: boolean; public_only?: boolean },
  attempts = 3
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await countShows(filter);
    } catch (error) {
      lastError = error;
      console.warn(
        `[podcastMassExpansionStatus] countShows attempt ${attempt}/${attempts} failed:`,
        error instanceof Error ? error.message : String(error)
      );
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError || "countShows_failed"));
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

    if (error) throw new Error(supabaseErrorMessage(error));
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

    if (error) throw new Error(supabaseErrorMessage(error));
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

export type PodcastMassExpansionCountOptions = {
  /** Skip episode exact-counts (slow/flaky at large catalogue sizes). */
  include_episodes?: boolean;
  /** Skip language/category facet sampling. */
  include_facets?: boolean;
};

export async function getPodcastMassExpansionCounts(
  options?: PodcastMassExpansionCountOptions
): Promise<PodcastMassExpansionCounts> {
  const includeEpisodes = options?.include_episodes !== false;
  const includeFacets = options?.include_facets !== false;

  // Show counts are required for target tracking; retry then soft-fail so expand
  // can continue when Supabase briefly rate-limits or returns empty errors.
  const [standard_shows, mature_shows, public_standard_shows, public_mature_shows] =
    await Promise.all([
      softCount("standard_shows", () => countShowsWithRetry({ is_mature: false })),
      softCount("mature_shows", () => countShowsWithRetry({ is_mature: true })),
      softCount("public_standard_shows", () =>
        countShowsWithRetry({ is_mature: false, public_only: true })
      ),
      softCount("public_mature_shows", () =>
        countShowsWithRetry({ is_mature: true, public_only: true })
      ),
    ]);

  const [total_episodes, public_episodes] = includeEpisodes
    ? await Promise.all([
        softCount("countEpisodes", countEpisodes),
        softCount("countPublicEpisodes", countPublicEpisodes),
      ])
    : [0, 0];

  const [languages, categories] = includeFacets
    ? await Promise.all([
        sampleDistinctLanguages().catch((error) => {
          console.warn(
            "[podcastMassExpansionStatus] sampleDistinctLanguages failed:",
            error instanceof Error ? error.message : String(error)
          );
          return [] as string[];
        }),
        sampleDistinctCategories().catch((error) => {
          console.warn(
            "[podcastMassExpansionStatus] sampleDistinctCategories failed:",
            error instanceof Error ? error.message : String(error)
          );
          return [] as string[];
        }),
      ])
    : [[], []];

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

/** Show counts only Ã¢â‚¬â€ used by the batch runner so preflight never stalls on episodes. */
export function getPodcastMassExpansionShowCounts() {
  return getPodcastMassExpansionCounts({
    include_episodes: false,
    include_facets: false,
  });
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
  targets: { standard: number; mature: number },
  catalog?: "standard" | "mature"
) {
  if (catalog === "mature") {
    return counts.public_mature_shows >= targets.mature;
  }
  if (catalog === "standard") {
    return counts.public_standard_shows >= targets.standard;
  }
  return (
    counts.public_standard_shows >= targets.standard &&
    counts.public_mature_shows >= targets.mature
  );
}

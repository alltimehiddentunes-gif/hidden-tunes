import {
  MOTIVATION_DEFAULT_PAGE_SIZE,
  applyPublicMotivationFilters,
  listMotivationCategories,
  toMotivationPublicItem,
} from "@/lib/motivationCatalog";
import { listMotivationPrograms } from "@/lib/motivationPrograms";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const HOME_FEATURED_PROGRAMS = 12;
const HOME_FEATURED_ITEMS = 12;
const HOME_RECOMMENDED = 20;
const HOME_POPULAR = 20;
const HOME_NEW_RELEASES = 20;

export async function buildMotivationHome() {
  const [categories, featuredPrograms, featuredItems, recommended, popular, newReleases] =
    await Promise.all([
      listMotivationCategories(),
      listMotivationPrograms({
        page: 1,
        limit: HOME_FEATURED_PROGRAMS,
        featuredOnly: true,
      }),
      loadHomeItems({ featuredOnly: true, limit: HOME_FEATURED_ITEMS }),
      loadHomeItems({ order: "featured", limit: HOME_RECOMMENDED }),
      loadHomeItems({ order: "popular", limit: HOME_POPULAR }),
      loadHomeItems({ order: "new", limit: HOME_NEW_RELEASES }),
    ]);

  const languages = await loadMotivationLanguageCounts();
  const countries = await loadMotivationCountryCounts();

  return {
    continue_listening: [],
    recently_played: [],
    featured_programs: featuredPrograms.programs,
    featured_items: featuredItems,
    recommended,
    popular,
    new_releases: newReleases,
    categories: categories.slice(0, 60),
    languages,
    countries,
  };
}

async function loadHomeItems(options: {
  featuredOnly?: boolean;
  order?: "featured" | "popular" | "new";
  limit: number;
}) {
  let query = applyPublicMotivationFilters(
    supabaseAdmin.from("motivation_items").select(
      "id, slug, title, description, thumbnail_url, channel_name, speaker_name, category, subcategory, category_slug, categories, tags, language, region, duration_seconds, reliability_score, is_featured, sort_order, published_at, created_at, media_type"
    ),
    { featuredOnly: options.featuredOnly }
  ).limit(options.limit);

  if (options.order === "popular") {
    query = query
      .order("reliability_score", { ascending: false })
      .order("sort_order", { ascending: false });
  } else if (options.order === "new") {
    query = query
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query
      .order("is_featured", { ascending: false })
      .order("sort_order", { ascending: false })
      .order("published_at", { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data || []) as Record<string, unknown>[]).map(toMotivationPublicItem);
}

async function loadMotivationLanguageCounts() {
  const { data, error } = await applyPublicMotivationFilters(
    supabaseAdmin.from("motivation_items").select("language"),
    {}
  ).limit(5000);

  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data || []) {
    const language = String((row as { language?: string }).language || "").trim();
    if (!language) continue;
    counts.set(language, (counts.get(language) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 80);
}

async function loadMotivationCountryCounts() {
  const { data, error } = await applyPublicMotivationFilters(
    supabaseAdmin.from("motivation_items").select("region, country_code"),
    {}
  ).limit(5000);

  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data || []) {
    const record = row as { region?: string; country_code?: string };
    const code = String(record.country_code || record.region || "").trim();
    if (!code) continue;
    counts.set(code, (counts.get(code) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 80);
}

export const MOTIVATION_HOME_SECTION_LIMITS = {
  continueListening: 10,
  recentlyPlayed: 10,
  featuredPrograms: HOME_FEATURED_PROGRAMS,
  featuredItems: HOME_FEATURED_ITEMS,
  recommended: HOME_RECOMMENDED,
  popular: HOME_POPULAR,
  newReleases: HOME_NEW_RELEASES,
  categories: 60,
  defaultPage: MOTIVATION_DEFAULT_PAGE_SIZE,
};

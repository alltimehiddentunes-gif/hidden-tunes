import { MATURE_PODCAST_SEED_FEEDS } from "@/lib/podcastSeedFeeds";
import {
  PODCAST_PUBLIC_EPISODE_LIST_SELECT,
  buildPodcastPagination,
  parsePodcastLimit,
  parsePodcastPage,
  toPodcastPublicEpisode,
} from "@/lib/podcastCatalog";
import { cleanPodcastFilter, parseBooleanQuery } from "@/lib/podcastPublicApi";
import { cleanText } from "@/lib/tvCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const MATURE_PODCAST_CATEGORIES = [
  {
    id: "relationships",
    slug: "relationships",
    name: "Relationships",
    description: "Adult relationship conversations",
    icon: "heart-outline",
    sort_order: 10,
  },
  {
    id: "dating",
    slug: "dating",
    name: "Dating",
    description: "Modern dating, boundaries, and stories",
    icon: "chatbubbles-outline",
    sort_order: 20,
  },
  {
    id: "intimacy-education",
    slug: "intimacy-education",
    name: "Intimacy Education",
    description: "Consent-forward adult education",
    icon: "school-outline",
    sort_order: 30,
  },
  {
    id: "adult-lifestyle",
    slug: "adult-lifestyle",
    name: "Adult Lifestyle",
    description: "Culture and lifestyle for adults",
    icon: "sparkles-outline",
    sort_order: 40,
  },
  {
    id: "confessions-stories",
    slug: "confessions-stories",
    name: "Confessions / Stories",
    description: "Personal stories and candid conversations",
    icon: "book-outline",
    sort_order: 50,
  },
  {
    id: "wellness-18",
    slug: "wellness-18",
    name: "Wellness 18+",
    description: "Adult wellness and health conversations",
    icon: "pulse-outline",
    sort_order: 60,
  },
  {
    id: "mature-comedy",
    slug: "mature-comedy",
    name: "Mature Comedy",
    description: "Explicit comedy for adult listeners",
    icon: "happy-outline",
    sort_order: 70,
  },
  {
    id: "mature-talk-shows",
    slug: "mature-talk-shows",
    name: "Mature Talk Shows",
    description: "Unfiltered interviews and talk shows",
    icon: "mic-outline",
    sort_order: 80,
  },
] as const;

export type MaturePodcastCategorySlug =
  (typeof MATURE_PODCAST_CATEGORIES)[number]["slug"];

const MATURE_SHOW_SLUGS_BY_CATEGORY = MATURE_PODCAST_SEED_FEEDS.reduce<
  Record<string, string[]>
>((map, feed) => {
  const bucket = map[feed.matureCategory] || [];
  bucket.push(feed.showSlug);
  map[feed.matureCategory] = bucket;
  return map;
}, {});

export function matureGateEnabled(query: {
  mature_enabled?: string | null;
  matureEnabled?: string | null;
  age_confirmed?: string | null;
  ageConfirmed?: string | null;
}) {
  const matureEnabled = parseBooleanQuery(
    query.mature_enabled || query.matureEnabled || null
  );
  const ageConfirmed = parseBooleanQuery(
    query.age_confirmed || query.ageConfirmed || null
  );
  return matureEnabled && ageConfirmed;
}

function escapeIlikePattern(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

async function resolveMatureShowIdsForCategory(category: string | null) {
  const { data, error } = await supabaseAdmin
    .from("podcast_shows")
    .select("id, slug, categories")
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("feed_status", "active")
    .eq("is_mature", true);
  if (error) throw error;

  const rows = data || [];
  if (!category) {
    return rows.map((row) => String(row.id));
  }

  const slugMatches = new Set(MATURE_SHOW_SLUGS_BY_CATEGORY[category] || []);

  return rows
    .filter((row) => {
      const slug = String(row.slug || "");
      if (slugMatches.has(slug)) return true;

      const categories = Array.isArray(row.categories) ? row.categories : [];
      return categories.some(
        (entry) => String(entry || "").trim().toLowerCase() === category
      );
    })
    .map((row) => String(row.id));
}

export async function countMatureEpisodesForCategory(category: string) {
  const showIds = await resolveMatureShowIdsForCategory(category);
  if (showIds.length === 0) return 0;

  const { count, error } = await supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true })
    .in("show_id", showIds)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable");

  if (error) throw error;
  return count || 0;
}

export async function listMaturePodcastCategories() {
  const categories = [];

  for (const category of MATURE_PODCAST_CATEGORIES) {
    const itemCount = await countMatureEpisodesForCategory(category.slug);
    categories.push({
      id: category.id,
      slug: category.slug,
      name: category.name,
      title: category.name,
      description: category.description,
      subtitle: category.description,
      icon: category.icon,
      sort_order: category.sort_order,
      item_count: itemCount,
    });
  }

  return categories;
}

export async function listMaturePodcastEpisodes(options: {
  category?: string | null;
  page: number;
  limit: number;
  searchQuery?: string | null;
}) {
  const from = (options.page - 1) * options.limit;
  const to = from + options.limit - 1;
  const showIds = await resolveMatureShowIdsForCategory(
    options.category || null
  );

  if (showIds.length === 0) {
    return {
      items: [],
      pagination: buildPodcastPagination(options.page, options.limit, 0),
    };
  }

  let query = supabaseAdmin
    .from("podcast_episodes")
    .select(PODCAST_PUBLIC_EPISODE_LIST_SELECT, { count: "exact" })
    .in("show_id", showIds)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (options.searchQuery) {
    const escaped = escapeIlikePattern(options.searchQuery);
    query = query.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return {
    items: ((data || []) as Record<string, unknown>[]).map((row) =>
      toPodcastPublicEpisode(row)
    ),
    pagination: buildPodcastPagination(
      options.page,
      options.limit,
      count || 0
    ),
  };
}

export async function backfillMatureShowCategories() {
  const updates: Array<{ slug: string; matureCategory: string }> = [];

  for (const feed of MATURE_PODCAST_SEED_FEEDS) {
    const { data: show, error } = await supabaseAdmin
      .from("podcast_shows")
      .select("id, slug, categories")
      .eq("slug", feed.showSlug)
      .maybeSingle();

    if (error) throw error;
    if (!show?.id) continue;

    const categories = Array.isArray(show.categories) ? show.categories : [];
    const nextCategories = Array.from(
      new Set([...categories.map(String), feed.matureCategory, feed.category])
    ).slice(0, 12);

    const payload: Record<string, unknown> = {
      categories: nextCategories,
    };

    let updateError = (
      await supabaseAdmin
        .from("podcast_shows")
        .update({ ...payload, mature_category: feed.matureCategory })
        .eq("id", show.id)
    ).error;

    if (
      updateError &&
      /mature_category/i.test(updateError.message) &&
      /does not exist|column/i.test(updateError.message)
    ) {
      updateError = (
        await supabaseAdmin.from("podcast_shows").update(payload).eq("id", show.id)
      ).error;
    }

    if (updateError) throw updateError;
    updates.push({ slug: feed.showSlug, matureCategory: feed.matureCategory });
  }

  return updates;
}

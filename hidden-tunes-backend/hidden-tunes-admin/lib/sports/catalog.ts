import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  SPORTS_HOME_SECTION_LIMIT,
  SPORTS_LIVE_CACHE_TTL_MS,
  SPORTS_PUBLIC_CATALOG_STATUSES,
  SPORTS_TAXONOMY_CACHE_TTL_MS,
  SPORTS_VIDEO_CACHE_TTL_MS,
} from "./constants";
import { sportsCacheGet, sportsCacheKey, sportsCacheSet } from "./cache";
import { isSportsFeatureEnabled } from "./featureFlags";
import type { SportsBrowseItem, SportsHomeSections, SportsPagination } from "./types";

export function toSportsBrowseItem(row: {
  id: string;
  title?: string | null;
  name?: string | null;
  subtitle?: string | null;
  sport_slug?: string | null;
  competition_name?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  status?: string | null;
  availability_status?: string | null;
  artwork_url?: string | null;
  access_type?: string | null;
  watch_action?: SportsBrowseItem["watchAction"];
  watch_label?: string | null;
  region_message?: string | null;
}): SportsBrowseItem {
  return {
    id: row.id,
    title: String(row.title || row.name || "").trim() || "Untitled",
    subtitle: row.subtitle ?? null,
    sportSlug: row.sport_slug ?? null,
    competitionName: row.competition_name ?? null,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    status: String(row.availability_status || row.status || "discovered"),
    artworkUrl: row.artwork_url ?? null,
    accessType: row.access_type ?? null,
    watchAction: row.watch_action ?? "none",
    watchLabel: row.watch_label ?? null,
    regionMessage: row.region_message ?? null,
  };
}

function emptyHome(): SportsHomeSections {
  return {
    liveNow: [],
    startingSoon: [],
    freeToWatch: [],
    football: [],
    basketball: [],
    otherLiveSports: [],
    sportsChannels: [],
    highlights: [],
    replays: [],
    recommended: [],
    continueWatching: [],
  };
}

async function safeSection<T>(
  label: string,
  fn: () => Promise<T[]>,
  errors: Array<{ section: string; error: string }>
): Promise<T[]> {
  try {
    return await fn();
  } catch (err) {
    errors.push({
      section: label,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export async function getSportsHome(input: {
  country: string;
  platform: string;
  limitPerSection?: number;
}): Promise<{
  sections: SportsHomeSections;
  sectionErrors: Array<{ section: string; error: string }>;
  featureEnabled: boolean;
}> {
  const featureEnabled = await isSportsFeatureEnabled("sports_enabled");
  if (!featureEnabled) {
    return { sections: emptyHome(), sectionErrors: [], featureEnabled: false };
  }

  const limit = Math.min(
    20,
    Math.max(10, input.limitPerSection ?? SPORTS_HOME_SECTION_LIMIT)
  );
  const cacheKey = sportsCacheKey([
    "sports-home",
    input.country,
    input.platform,
    limit,
  ]);
  const cached = sportsCacheGet<{
    sections: SportsHomeSections;
    sectionErrors: Array<{ section: string; error: string }>;
  }>(cacheKey);
  if (cached) {
    return { ...cached, featureEnabled: true };
  }

  const sectionErrors: Array<{ section: string; error: string }> = [];
  const nowIso = new Date().toISOString();
  const soonIso = new Date(Date.now() + 2 * 60 * 60_000).toISOString();

  const liveNow = await safeSection(
    "liveNow",
    async () => {
      const { data, error } = await supabaseAdmin
        .from("sports_broadcasts")
        .select(
          "id, title, starts_at, ends_at, availability_status, access_type, broadcast_type"
        )
        .eq("availability_status", "live")
        .not("published_at", "is", null)
        .is("unpublished_at", null)
        .is("quarantined_at", null)
        .order("starts_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data || []).map((row) =>
        toSportsBrowseItem({
          ...row,
          watch_action: "none",
          watch_label: "Resolve on tap",
        })
      );
    },
    sectionErrors
  );

  const startingSoon = await safeSection(
    "startingSoon",
    async () => {
      const { data, error } = await supabaseAdmin
        .from("sports_broadcasts")
        .select(
          "id, title, starts_at, ends_at, availability_status, access_type"
        )
        .in("availability_status", ["scheduled", "verified"])
        .gte("starts_at", nowIso)
        .lte("starts_at", soonIso)
        .not("published_at", "is", null)
        .is("unpublished_at", null)
        .is("quarantined_at", null)
        .order("starts_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data || []).map((row) =>
        toSportsBrowseItem({
          ...row,
          watch_action: "reminder",
          watch_label: "Reminder",
        })
      );
    },
    sectionErrors
  );

  const freeToWatch = await safeSection(
    "freeToWatch",
    async () => {
      const { data, error } = await supabaseAdmin
        .from("sports_broadcasts")
        .select(
          "id, title, starts_at, ends_at, availability_status, access_type"
        )
        .eq("access_type", "free")
        .in("availability_status", SPORTS_PUBLIC_CATALOG_STATUSES)
        .not("published_at", "is", null)
        .is("unpublished_at", null)
        .is("quarantined_at", null)
        .order("starts_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data || []).map((row) => toSportsBrowseItem(row));
    },
    sectionErrors
  );

  const sportsChannels = await safeSection(
    "sportsChannels",
    async () => {
      const { data, error } = await supabaseAdmin
        .from("sports_channels")
        .select("id, name, status, artwork_url")
        .in("status", SPORTS_PUBLIC_CATALOG_STATUSES)
        .not("published_at", "is", null)
        .is("unpublished_at", null)
        .is("quarantined_at", null)
        .order("name", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data || []).map((row) =>
        toSportsBrowseItem({
          id: row.id,
          name: row.name,
          status: row.status,
          artwork_url: row.artwork_url,
        })
      );
    },
    sectionErrors
  );

  const highlights = await safeSection(
    "highlights",
    async () => {
      const { data, error } = await supabaseAdmin
        .from("sports_videos")
        .select("id, title, status, artwork_url, video_type")
        .eq("video_type", "highlights")
        .in("status", SPORTS_PUBLIC_CATALOG_STATUSES)
        .not("published_at", "is", null)
        .is("unpublished_at", null)
        .is("quarantined_at", null)
        .order("published_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data || []).map((row) =>
        toSportsBrowseItem({
          id: row.id,
          title: row.title,
          status: row.status,
          artwork_url: row.artwork_url,
        })
      );
    },
    sectionErrors
  );

  const replays = await safeSection(
    "replays",
    async () => {
      const { data, error } = await supabaseAdmin
        .from("sports_videos")
        .select("id, title, status, artwork_url, video_type")
        .eq("video_type", "replay")
        .in("status", SPORTS_PUBLIC_CATALOG_STATUSES)
        .not("published_at", "is", null)
        .is("unpublished_at", null)
        .is("quarantined_at", null)
        .order("published_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data || []).map((row) =>
        toSportsBrowseItem({
          id: row.id,
          title: row.title,
          status: row.status,
          artwork_url: row.artwork_url,
        })
      );
    },
    sectionErrors
  );

  const seen = new Set<string>();
  const dedupe = (items: SportsBrowseItem[]) =>
    items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

  const sections: SportsHomeSections = {
    liveNow: dedupe(liveNow),
    startingSoon: dedupe(startingSoon),
    freeToWatch: dedupe(freeToWatch),
    football: [],
    basketball: [],
    otherLiveSports: [],
    sportsChannels: dedupe(sportsChannels),
    highlights: dedupe(highlights),
    replays: dedupe(replays),
    recommended: [],
    continueWatching: [],
  };

  // Drop empty sections for the response builder (caller may omit).
  sportsCacheSet(
    cacheKey,
    { sections, sectionErrors },
    SPORTS_LIVE_CACHE_TTL_MS
  );

  return { sections, sectionErrors, featureEnabled: true };
}

export function omitEmptyHomeSections(
  sections: SportsHomeSections
): Partial<SportsHomeSections> {
  const out: Partial<SportsHomeSections> = {};
  for (const [key, value] of Object.entries(sections) as Array<
    [keyof SportsHomeSections, SportsBrowseItem[]]
  >) {
    if (value.length > 0) out[key] = value;
  }
  return out;
}

export async function listSportsTaxonomy() {
  const cacheKey = "sports-taxonomy";
  const cached = sportsCacheGet<{ sports: unknown[]; categories: unknown[] }>(
    cacheKey
  );
  if (cached) return cached;

  const [sportsRes, categoriesRes] = await Promise.all([
    supabaseAdmin
      .from("sports")
      .select("id, slug, name, description, artwork_url, sort_order")
      .eq("status", "active")
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("sport_categories")
      .select("id, slug, name, description, sport_id, sort_order")
      .eq("status", "active")
      .order("sort_order", { ascending: true }),
  ]);

  const payload = {
    sports: sportsRes.data || [],
    categories: categoriesRes.data || [],
  };
  sportsCacheSet(cacheKey, payload, SPORTS_TAXONOMY_CACHE_TTL_MS);
  return payload;
}

export async function listPaginated(
  table: string,
  select: string,
  filters: {
    statusIn?: string[];
    q?: string;
    qColumns?: string[];
    from: number;
    to: number;
    order?: { column: string; ascending?: boolean };
    publishedOnly?: boolean;
  }
): Promise<{ items: Record<string, unknown>[]; pagination: SportsPagination }> {
  let query = supabaseAdmin.from(table).select(select);

  if (filters.statusIn?.length) {
    query = query.in("status", filters.statusIn);
  }
  if (filters.publishedOnly) {
    query = query
      .not("published_at", "is", null)
      .is("unpublished_at", null)
      .is("quarantined_at", null);
  }
  if (filters.q && filters.qColumns?.length) {
    const term = filters.q.replace(/%/g, "").trim();
    if (term) {
      const or = filters.qColumns
        .map((col) => `${col}.ilike.%${term}%`)
        .join(",");
      query = query.or(or);
    }
  }

  const orderCol = filters.order?.column || "created_at";
  const ascending = filters.order?.ascending ?? false;
  const { data, error } = await query
    .order(orderCol, { ascending })
    .range(filters.from, filters.to);

  if (error) throw new Error(error.message);

  const rows = data || [];
  const limit = filters.to - filters.from;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: items as unknown as Record<string, unknown>[],
    pagination: {
      page: Math.floor(filters.from / Math.max(1, limit)) + 1,
      limit,
      hasMore,
    },
  };
}

export { SPORTS_VIDEO_CACHE_TTL_MS };

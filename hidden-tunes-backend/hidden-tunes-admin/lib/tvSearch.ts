import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  TV_PUBLIC_VIDEO_SELECT,
  TV_VIDEO_SOURCE_TYPE,
  TvPublicVideo,
  buildYouTubeEmbedUrl,
  buildYouTubeThumbnailUrl,
  buildYouTubeWatchUrl,
  cleanText,
  extractYouTubeVideoId,
  hasYouTubeDataApiKey,
  inferCategoryGenreMoodFormat,
  normalizeTvTags,
  parsePositiveInt,
  toTvPublicStation,
} from "@/lib/tvCatalog";
import { TV_RELIABILITY_THRESHOLD } from "@/lib/tvStationHealth";
import {
  applyTvPublicCatalogFilters,
  applyTvSearchDiscoveryCatalogFilters,
  type SupabaseFilterQuery,
  type TvClientPlatform,
} from "@/lib/tvPlatformPolicy";
import {
  buildTvSearchDedupeIndex,
  filterDiscoveryRowsAgainstVerifiedIndex,
  type TvSearchDedupeRow,
} from "@/lib/tvSearchDedupe";
import { mergeTvSearchResultsVerifiedFirst } from "@/lib/tvSearchMerge";

const YOUTUBE_SEARCH_API = "https://www.googleapis.com/youtube/v3/search";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SEARCH_DEDUPE_SELECT =
  "id, source_type, source_id, source_key, source_url, title, region";
const SEARCH_RESULT_SELECT = `${TV_PUBLIC_VIDEO_SELECT}, source_type, source_id, source_key, source_url`;

export type TvSearchResult = {
  videos: TvPublicVideo[];
  catalogCount: number;
  verifiedCount: number;
  discoveryCount: number;
  liveCount: number;
  liveSearchEnabled: boolean;
  nextPageToken: string | null;
  total: number;
  error: string | null;
};

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

function getYouTubeApiKey() {
  return String(process.env.YOUTUBE_DATA_API_KEY || "").trim();
}

function mapYouTubeSearchItem(item: YouTubeSearchItem): TvPublicVideo | null {
  const videoId = extractYouTubeVideoId(item?.id?.videoId || "");
  const title = cleanText(item?.snippet?.title, 300);

  if (!videoId || !title) return null;

  const channelName = cleanText(item?.snippet?.channelTitle, 200);
  const thumbnailUrl =
    cleanText(item?.snippet?.thumbnails?.high?.url, 2000) ||
    cleanText(item?.snippet?.thumbnails?.medium?.url, 2000) ||
    cleanText(item?.snippet?.thumbnails?.default?.url, 2000) ||
    buildYouTubeThumbnailUrl(videoId);

  const inferred = inferCategoryGenreMoodFormat(title, channelName, {});
  const categories = normalizeTvTags([
    inferred.category,
    inferred.genre,
    inferred.mood,
    inferred.format,
    ...inferred.tags,
    "tv-search",
    "youtube-live",
  ]).filter(Boolean);

  return {
    id: `tv-search-${videoId}`,
    title,
    description: null,
    logo: thumbnailUrl,
    country: null,
    language: null,
    categories,
    reliability_score: TV_RELIABILITY_THRESHOLD,
    is_featured: false,
    public: true,
    verified: true,
    playable: true,
    disabled: false,
    ios_playable: true,
    android_playable: true,
    stream_protocol: "youtube",
    stream_is_https: true,
    last_validated_at: new Date().toISOString(),
    last_validation_result: "youtube_search",
    failure_count: 0,
    playback_status: "playable",
    last_health_checked_at: new Date().toISOString(),
    quarantined_at: null,
  };
}

function escapeSearchQuery(query: string) {
  return query.replace(/[%_]/g, "\\$&");
}

function applySearchTextFilter(query: SupabaseFilterQuery, escaped: string) {
  query.or(`title.ilike.%${escaped}%,channel_name.ilike.%${escaped}%`);
}

function mapSearchRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => toTvPublicStation(row));
}

async function countSearchTier(
  query: string,
  platform: TvClientPlatform,
  tier: "verified" | "discovery"
) {
  const escaped = escapeSearchQuery(query);
  let dbQuery = supabaseAdmin
    .from("tv_videos")
    .select("id", { count: "exact", head: true }) as unknown as SupabaseFilterQuery;

  if (tier === "verified") {
    applyTvPublicCatalogFilters(dbQuery, platform);
  } else {
    applyTvSearchDiscoveryCatalogFilters(dbQuery, platform);
  }
  applySearchTextFilter(dbQuery, escaped);

  const { count, error } = await dbQuery.range(0, 0);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function loadVerifiedSearchDedupeIndex(query: string, platform: TvClientPlatform) {
  const escaped = escapeSearchQuery(query);
  const pageSize = 1000;
  const rows: TvSearchDedupeRow[] = [];
  let from = 0;

  while (true) {
    let dbQuery = supabaseAdmin
      .from("tv_videos")
      .select(SEARCH_DEDUPE_SELECT) as unknown as SupabaseFilterQuery;

    applyTvPublicCatalogFilters(dbQuery, platform);
    applySearchTextFilter(dbQuery, escaped);

    const { data, error } = await dbQuery.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);

    const batch = (data || []) as TvSearchDedupeRow[];
    if (batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
    if (from > 250_000) break;
  }

  return buildTvSearchDedupeIndex(rows);
}

async function fetchSearchTierSlice(
  query: string,
  platform: TvClientPlatform,
  tier: "verified" | "discovery",
  offset: number,
  limit: number
) {
  if (limit <= 0) {
    return [] as Record<string, unknown>[];
  }

  const escaped = escapeSearchQuery(query);
  let dbQuery = supabaseAdmin
    .from("tv_videos")
    .select(SEARCH_RESULT_SELECT) as unknown as SupabaseFilterQuery;

  if (tier === "verified") {
    applyTvPublicCatalogFilters(dbQuery, platform);
  } else {
    applyTvSearchDiscoveryCatalogFilters(dbQuery, platform);
  }
  applySearchTextFilter(dbQuery, escaped);

  const { data, error } = await dbQuery
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return (data || []) as Record<string, unknown>[];
}

async function fetchDiscoveryPageDeduped(
  query: string,
  platform: TvClientPlatform,
  verifiedIndex: ReturnType<typeof buildTvSearchDedupeIndex>,
  discoveryOffset: number,
  need: number
) {
  const accepted: Record<string, unknown>[] = [];
  let scanOffset = discoveryOffset;
  let scanned = 0;
  const batchSize = Math.max(need * 4, 40);

  while (accepted.length < need && scanned < 10_000) {
    const batch = await fetchSearchTierSlice(
      query,
      platform,
      "discovery",
      scanOffset,
      batchSize
    );
    if (batch.length === 0) break;

    const filtered = filterDiscoveryRowsAgainstVerifiedIndex(batch, verifiedIndex);
    accepted.push(...filtered);
    scanOffset += batch.length;
    scanned += batch.length;
    if (batch.length < batchSize) break;
  }

  return accepted.slice(0, need);
}

async function countDiscoveryEligibleAfterDedupe(
  query: string,
  platform: TvClientPlatform,
  verifiedIndex: ReturnType<typeof buildTvSearchDedupeIndex>,
  discoveryTotalRaw: number
) {
  if (discoveryTotalRaw <= 0) return 0;

  let eligible = 0;
  let scanOffset = 0;
  const batchSize = 1000;

  while (scanOffset < discoveryTotalRaw && scanOffset < 250_000) {
    const batch = await fetchSearchTierSlice(
      query,
      platform,
      "discovery",
      scanOffset,
      batchSize
    );
    if (batch.length === 0) break;
    eligible += filterDiscoveryRowsAgainstVerifiedIndex(batch, verifiedIndex).length;
    scanOffset += batch.length;
    if (batch.length < batchSize) break;
  }

  return eligible;
}

export async function searchTvCatalogPlayable(
  query: string,
  page: number,
  limit: number,
  platform: TvClientPlatform = "cross"
) {
  const offset = (page - 1) * limit;
  const rows = await fetchSearchTierSlice(query, platform, "verified", offset, limit);
  const total = await countSearchTier(query, platform, "verified");
  const videos = mapSearchRows(rows);

  return {
    videos,
    total,
  };
}

export async function searchYouTubeLivePlayable(
  query: string,
  limit: number,
  pageToken?: string | null
) {
  const apiKey = getYouTubeApiKey();

  if (!apiKey || !hasYouTubeDataApiKey()) {
    return {
      videos: [] as TvPublicVideo[],
      nextPageToken: null,
      error: "YouTube Data API is not configured on the server.",
    };
  }

  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, limit));
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: query,
    maxResults: String(safeLimit),
    videoEmbeddable: "true",
    safeSearch: "moderate",
    key: apiKey,
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const response = await fetch(`${YOUTUBE_SEARCH_API}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const bodyText = await response.text();

  if (!response.ok) {
    let message = `YouTube search failed (${response.status}).`;

    try {
      const parsed = JSON.parse(bodyText) as {
        error?: { message?: string };
      };
      if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch {}

    return {
      videos: [] as TvPublicVideo[],
      nextPageToken: null,
      error: message,
    };
  }

  const payload = JSON.parse(bodyText) as {
    items?: YouTubeSearchItem[];
    nextPageToken?: string;
  };

  const videos = (payload.items || [])
    .map((item) => mapYouTubeSearchItem(item))
    .filter((item): item is TvPublicVideo => item !== null);

  return {
    videos,
    nextPageToken: cleanText(payload.nextPageToken, 200),
    error: null,
  };
}

function dedupeBySourceId(videos: TvPublicVideo[]) {
  const seen = new Set<string>();
  const merged: TvPublicVideo[] = [];

  for (const video of videos) {
    const key = String(video.id || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(video);
  }

  return merged;
}

export async function runTvLiveSearch(options: {
  query: string;
  page?: number;
  limit?: number;
  pageToken?: string | null;
  platform?: TvClientPlatform;
}): Promise<TvSearchResult> {
  const query = cleanText(options.query, 200) || "";
  const page = parsePositiveInt(String(options.page || 1), 1, 10_000);
  const limit = parsePositiveInt(String(options.limit || DEFAULT_LIMIT), DEFAULT_LIMIT, MAX_LIMIT);
  const platform = options.platform || "cross";
  if (!query) {
    return {
      videos: [],
      catalogCount: 0,
      verifiedCount: 0,
      discoveryCount: 0,
      liveCount: 0,
      liveSearchEnabled: hasYouTubeDataApiKey(),
      nextPageToken: null,
      total: 0,
      error: null,
    };
  }

  const offset = (page - 1) * limit;
  const [verifiedTotal, discoveryTotalRaw, verifiedIndex] = await Promise.all([
    countSearchTier(query, platform, "verified"),
    countSearchTier(query, platform, "discovery"),
    loadVerifiedSearchDedupeIndex(query, platform),
  ]);

  const verifiedOffset = Math.min(offset, verifiedTotal);
  const verifiedLimit = offset < verifiedTotal ? Math.min(limit, verifiedTotal - offset) : 0;
  const verifiedRows =
    verifiedLimit > 0
      ? mapSearchRows(
          await fetchSearchTierSlice(query, platform, "verified", verifiedOffset, verifiedLimit)
        )
      : [];

  const discoveryNeeded = limit - verifiedRows.length;
  const discoveryOffset = Math.max(0, offset - verifiedTotal);
  const discoveryRowsRaw =
    discoveryNeeded > 0
      ? await fetchDiscoveryPageDeduped(
          query,
          platform,
          verifiedIndex,
          discoveryOffset,
          discoveryNeeded
        )
      : [];
  const discoveryRows = mapSearchRows(discoveryRowsRaw);

  const videos = dedupeBySourceId(
    mergeTvSearchResultsVerifiedFirst(verifiedRows, discoveryRows, limit)
  );

  const discoveryEligibleTotal = await countDiscoveryEligibleAfterDedupe(
    query,
    platform,
    verifiedIndex,
    discoveryTotalRaw
  );
  const combinedTotal = verifiedTotal + discoveryEligibleTotal;
  const hasMore = page * limit < combinedTotal;

  return {
    videos,
    catalogCount: videos.length,
    verifiedCount: verifiedRows.length,
    discoveryCount: discoveryRows.length,
    liveCount: 0,
    liveSearchEnabled: false,
    nextPageToken: null,
    total: hasMore ? page * limit + 1 : combinedTotal,
    error: null,
  };
}

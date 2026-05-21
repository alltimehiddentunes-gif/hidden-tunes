export const TV_SOURCE_TYPES = [
  "youtube_channel",
  "youtube_playlist",
  "youtube_video",
  "archive_collection",
  "hls_stream",
  "m3u_playlist",
  "manual",
] as const;

export const TV_SCAN_FREQUENCIES = ["manual", "daily", "weekly", "monthly"] as const;

export const TV_VIDEO_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "blocked",
  "inactive",
] as const;

export const TV_PLAYBACK_STATUSES = [
  "unchecked",
  "playable",
  "failed",
  "blocked",
  "private",
  "deleted",
  "region_blocked",
  "embed_blocked",
] as const;

export const TV_IMPORT_JOB_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export const TV_VIDEO_SOURCE_TYPE = "youtube_video";
export const TV_MAX_IMPORT_VIDEOS = 200;
export const TV_OEMBED_FETCH_CONCURRENCY = 6;

export type TvSourceType = (typeof TV_SOURCE_TYPES)[number];
export type TvScanFrequency = (typeof TV_SCAN_FREQUENCIES)[number];
export type TvVideoStatus = (typeof TV_VIDEO_STATUSES)[number];
export type TvPlaybackStatus = (typeof TV_PLAYBACK_STATUSES)[number];

export type TvSourceRow = {
  id: string;
  source_type: TvSourceType | string;
  source_url: string;
  source_id: string | null;
  title: string | null;
  default_category: string | null;
  default_genre: string | null;
  default_mood: string | null;
  scan_frequency: TvScanFrequency | string;
  auto_approve: boolean;
  is_active: boolean;
  last_scanned_at: string | null;
  created_at: string | null;
};

export type TvVideoRow = {
  id: string;
  source_type: string;
  source_id: string;
  source_url: string;
  embed_url: string | null;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  channel_name: string | null;
  category: string | null;
  genre: string | null;
  mood: string | null;
  format: string | null;
  tags: string[] | null;
  language: string | null;
  region: string | null;
  published_at: string | null;
  status: TvVideoStatus | string;
  playback_status: TvPlaybackStatus | string;
  is_active: boolean;
  is_featured: boolean;
  imported_from_source_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type TvSourceDefaults = {
  category?: string | null;
  genre?: string | null;
  mood?: string | null;
};

export type TvInferredMetadata = {
  category: string | null;
  genre: string | null;
  mood: string | null;
  format: string | null;
  tags: string[];
};

export type YouTubeChannelRef = {
  kind: "channel_id" | "handle" | "custom" | "user";
  value: string;
};

export type YouTubeOEmbedMetadata = {
  title: string;
  channel_name: string | null;
  thumbnail_url: string | null;
};

export const TV_SOURCE_SELECT =
  "id, source_type, source_url, source_id, title, default_category, default_genre, default_mood, scan_frequency, auto_approve, is_active, last_scanned_at, created_at";

export const TV_VIDEO_SELECT =
  "id, source_type, source_id, source_url, embed_url, title, description, thumbnail_url, duration_seconds, channel_name, category, genre, mood, format, tags, language, region, published_at, status, playback_status, is_active, is_featured, imported_from_source_id, created_at, updated_at";

export const TV_PUBLIC_VIDEO_SELECT =
  "id, title, source_type, source_id, source_url, embed_url, thumbnail_url, channel_name, category, genre, mood, format, tags";

export type TvPublicVideo = {
  id: string;
  title: string;
  source_type: string;
  source_id: string;
  source_url: string;
  embed_url: string | null;
  thumbnail_url: string | null;
  channel_name: string | null;
  category: string | null;
  genre: string | null;
  mood: string | null;
  format: string | null;
  tags: string[];
};

export function toTvPublicVideo(row: Record<string, unknown>): TvPublicVideo {
  return {
    id: String(row.id || ""),
    title: String(row.title || "Untitled"),
    source_type: String(row.source_type || ""),
    source_id: String(row.source_id || ""),
    source_url: String(row.source_url || ""),
    embed_url: cleanText(row.embed_url, 2000),
    thumbnail_url: cleanText(row.thumbnail_url, 2000),
    channel_name: cleanText(row.channel_name, 200),
    category: cleanText(row.category, 120),
    genre: cleanText(row.genre, 120),
    mood: cleanText(row.mood, 120),
    format: cleanText(row.format, 120),
    tags: normalizeTvTags(row.tags),
  };
}

export function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

export function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.floor(parsed));
}

export function isAllowedValue<T extends readonly string[]>(
  value: unknown,
  allowed: T
): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function extractYouTubeVideoId(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && id.length === 11 ? id : null;
    }

    if (host.includes("youtube.com") || host.includes("youtube-nocookie.com")) {
      const queryId = url.searchParams.get("v");
      if (queryId && queryId.length === 11) return queryId;

      const parts = url.pathname.split("/").filter(Boolean);
      const marker = parts[0];
      const id = parts[1];

      if (
        (marker === "embed" ||
          marker === "shorts" ||
          marker === "live" ||
          marker === "v") &&
        id &&
        id.length === 11
      ) {
        return id;
      }
    }
  } catch {
    const match = raw.match(/(?:v=|\/embed\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    return match?.[1] || null;
  }

  return null;
}

export function extractYouTubePlaylistId(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  if (/^PL[\w-]{10,}$/i.test(raw)) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const listId = url.searchParams.get("list");
    if (listId && /^PL[\w-]+$/i.test(listId)) {
      return listId;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const playlistIndex = parts.indexOf("playlist");
    if (playlistIndex >= 0 && parts[playlistIndex + 1]) {
      const candidate = parts[playlistIndex + 1];
      if (/^PL[\w-]+$/i.test(candidate)) return candidate;
    }
  } catch {
    const match = raw.match(/[?&]list=(PL[\w-]+)/i);
    return match?.[1] || null;
  }

  return null;
}

export function extractYouTubeChannelIdOrHandle(
  input: string
): YouTubeChannelRef | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  if (/^UC[\w-]{20,}$/i.test(raw)) {
    return { kind: "channel_id", value: raw };
  }

  if (raw.startsWith("@")) {
    return { kind: "handle", value: raw.slice(1) };
  }

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (!host.includes("youtube.com")) {
      return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const marker = parts[0];

    if (marker === "channel" && parts[1]) {
      return { kind: "channel_id", value: parts[1] };
    }

    if (marker?.startsWith("@")) {
      return { kind: "handle", value: marker.slice(1) };
    }

    if (marker === "c" && parts[1]) {
      return { kind: "custom", value: parts[1] };
    }

    if (marker === "user" && parts[1]) {
      return { kind: "user", value: parts[1] };
    }
  } catch {
    const handleMatch = raw.match(/^@([\w.-]+)$/);
    if (handleMatch?.[1]) {
      return { kind: "handle", value: handleMatch[1] };
    }
  }

  return null;
}

export function buildYouTubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function buildYouTubeEmbedUrl(videoId: string) {
  return `https://www.youtube.com/embed/${videoId}`;
}

export function buildYouTubeThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function normalizeTvTags(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => cleanText(entry, 80))
      .filter(Boolean)
      .slice(0, 24) as string[];
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 24);
  }

  return [];
}

export function normalizeTagsInput(value: unknown) {
  return normalizeTvTags(value);
}

export function parseManualVideoList(
  input: unknown,
  maxVideos = TV_MAX_IMPORT_VIDEOS
) {
  const raw = typeof input === "string" ? input : "";
  const lines = raw.split(/\r?\n/);
  const seen = new Set<string>();
  const videoIds: string[] = [];
  let invalidLineCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const videoId = extractYouTubeVideoId(trimmed);
    if (!videoId) {
      invalidLineCount += 1;
      continue;
    }

    if (seen.has(videoId)) continue;
    seen.add(videoId);

    if (videoIds.length >= maxVideos) {
      break;
    }

    videoIds.push(videoId);
  }

  return {
    videoIds,
    invalidLineCount,
    truncated: seen.size > maxVideos,
  };
}

const GENRE_KEYWORDS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\b(afrobeats?|afrobeat)\b/i, value: "Afrobeats" },
  { pattern: /\b(amapiano)\b/i, value: "Amapiano" },
  { pattern: /\b(highlife)\b/i, value: "Highlife" },
  { pattern: /\b(hiplife)\b/i, value: "Hiplife" },
  { pattern: /\b(gospel)\b/i, value: "Gospel" },
  { pattern: /\b(hip[\s-]?hop|rap)\b/i, value: "Hip Hop" },
  { pattern: /\b(r&b|rhythm and blues)\b/i, value: "R&B" },
  { pattern: /\b(jazz)\b/i, value: "Jazz" },
  { pattern: /\b(blues)\b/i, value: "Blues" },
  { pattern: /\b(soul)\b/i, value: "Soul" },
  { pattern: /\b(reggae)\b/i, value: "Reggae" },
  { pattern: /\b(dancehall)\b/i, value: "Dancehall" },
  { pattern: /\b(drill)\b/i, value: "Drill" },
  { pattern: /\b(trap)\b/i, value: "Trap" },
  { pattern: /\b(pop)\b/i, value: "Pop" },
  { pattern: /\b(rock)\b/i, value: "Rock" },
  { pattern: /\b(country)\b/i, value: "Country" },
  { pattern: /\b(folk)\b/i, value: "Folk" },
  { pattern: /\b(classical)\b/i, value: "Classical" },
  { pattern: /\b(electronic|edm|house|techno)\b/i, value: "Electronic" },
  { pattern: /\b(reggaeton|latin)\b/i, value: "Reggaeton" },
  { pattern: /\b(podcast|talk)\b/i, value: "Spoken Word" },
];

const MOOD_KEYWORDS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\b(chill|relaxed|mellow)\b/i, value: "Chill" },
  { pattern: /\b(energetic|hype|party)\b/i, value: "Energetic" },
  { pattern: /\b(romantic|love)\b/i, value: "Romantic" },
  { pattern: /\b(sad|melancholy|heartbreak)\b/i, value: "Melancholy" },
  { pattern: /\b(happy|uplifting|feel good)\b/i, value: "Uplifting" },
  { pattern: /\b(dark|moody)\b/i, value: "Dark" },
  { pattern: /\b(focus|study|work)\b/i, value: "Focus" },
  { pattern: /\b(worship|praise)\b/i, value: "Worship" },
  { pattern: /\b(nostalgic|retro|throwback)\b/i, value: "Nostalgic" },
];

const FORMAT_KEYWORDS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\b(live|concert|performance)\b/i, value: "Live Performance" },
  { pattern: /\b(shorts?|#shorts)\b/i, value: "Short" },
  { pattern: /\b(official video|music video|mv)\b/i, value: "Music Video" },
  { pattern: /\b(lyric video|lyrics)\b/i, value: "Lyric Video" },
  { pattern: /\b(audio only|audio)\b/i, value: "Audio" },
  { pattern: /\b(interview|podcast|talk)\b/i, value: "Interview" },
  { pattern: /\b(documentary|docu)\b/i, value: "Documentary" },
  { pattern: /\b(remix)\b/i, value: "Remix" },
  { pattern: /\b(cover)\b/i, value: "Cover" },
  { pattern: /\b(trailer)\b/i, value: "Trailer" },
];

const CATEGORY_KEYWORDS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\b(music|song|album|track)\b/i, value: "Music" },
  { pattern: /\b(comedy|funny|sketch)\b/i, value: "Comedy" },
  { pattern: /\b(news|current events)\b/i, value: "News" },
  { pattern: /\b(sports|football|soccer|basketball)\b/i, value: "Sports" },
  { pattern: /\b(education|tutorial|how to)\b/i, value: "Education" },
  { pattern: /\b(film|movie|cinema)\b/i, value: "Film" },
  { pattern: /\b(gaming|gameplay|esports)\b/i, value: "Gaming" },
  { pattern: /\b(fashion|style|beauty)\b/i, value: "Fashion" },
  { pattern: /\b(food|cooking|recipe)\b/i, value: "Food" },
  { pattern: /\b(travel|vlog)\b/i, value: "Travel" },
];

function matchKeywordValue(
  haystack: string,
  rules: Array<{ pattern: RegExp; value: string }>
) {
  for (const rule of rules) {
    if (rule.pattern.test(haystack)) {
      return rule.value;
    }
  }

  return null;
}

export function inferCategoryGenreMoodFormat(
  title: string,
  description: string | null,
  defaults: TvSourceDefaults = {}
): TvInferredMetadata {
  const haystack = `${title} ${description || ""}`.trim();

  const inferredCategory =
    matchKeywordValue(haystack, CATEGORY_KEYWORDS) || defaults.category || null;
  const inferredGenre =
    matchKeywordValue(haystack, GENRE_KEYWORDS) || defaults.genre || null;
  const inferredMood =
    matchKeywordValue(haystack, MOOD_KEYWORDS) || defaults.mood || null;
  const inferredFormat = matchKeywordValue(haystack, FORMAT_KEYWORDS);

  const tags = normalizeTvTags(
    [inferredGenre, inferredMood, inferredFormat, inferredCategory].filter(
      Boolean
    ) as string[]
  );

  return {
    category: inferredCategory,
    genre: inferredGenre,
    mood: inferredMood,
    format: inferredFormat,
    tags,
  };
}

export async function fetchYouTubeOEmbedMetadata(
  videoId: string
): Promise<YouTubeOEmbedMetadata | null> {
  const watchUrl = buildYouTubeWatchUrl(videoId);
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    watchUrl
  )}&format=json`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const title = cleanText(payload.title, 300);
    if (!title) return null;

    return {
      title,
      channel_name: cleanText(payload.author_name, 200),
      thumbnail_url: cleanText(payload.thumbnail_url, 2000),
    };
  } catch {
    return null;
  }
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

export function hasYouTubeDataApiKey() {
  return Boolean(process.env.YOUTUBE_DATA_API_KEY?.trim());
}

export function summarizeFailedVideoIds(failedIds: string[], maxListed = 40) {
  if (failedIds.length === 0) return null;

  const listed = failedIds.slice(0, maxListed).join(", ");
  const suffix =
    failedIds.length > maxListed
      ? ` (+${failedIds.length - maxListed} more)`
      : "";

  return `oEmbed/metadata failed for ${failedIds.length} video(s): ${listed}${suffix}`;
}

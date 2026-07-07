import type { PodcastMatureLevel, PodcastShow } from "../types/podcast";

export const PODCAST_CATALOG_BASE_URL = "https://admin.hiddentunes.com";
export const PODCAST_HOME_API_PATH = "/api/podcasts/shows";
export const PODCAST_HOME_PAGE_LIMIT = 24;

export type PodcastHomeMetadataSection = {
  id: string;
  title: string;
  shows: PodcastShow[];
};

export type PodcastHomeMetadataResponse = {
  success: boolean;
  sections: PodcastHomeMetadataSection[];
  error?: string;
};

const BLOCKED_PLAYABLE_KEYS = new Set([
  "audioUrl",
  "enclosureUrl",
  "streamUrl",
  "url",
  "playbackUrl",
]);

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanOptionalString(value: unknown) {
  const cleaned = cleanString(value);
  return cleaned || undefined;
}

function normalizeCategories(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => cleanString(entry))
      .filter(Boolean)
      .slice(0, 12);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  return [];
}

function normalizeMatureLevel(value: unknown): PodcastMatureLevel {
  return value === "explicit" || value === "adult" ? value : "safe";
}

function stripPlayableFields(raw: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!BLOCKED_PLAYABLE_KEYS.has(key)) {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

function normalizePodcastShow(raw: unknown): PodcastShow | null {
  if (!raw || typeof raw !== "object") return null;
  const safe = stripPlayableFields(raw as Record<string, unknown>);

  const id = cleanString(safe.id);
  const title = cleanString(safe.title);
  if (!id || !title) return null;

  const publisher = cleanString(safe.publisher, title) || title;
  const matureLevel = normalizeMatureLevel(safe.matureLevel ?? safe.mature_level);
  const categories = normalizeCategories(safe.categories);
  const feedUrl = cleanString(safe.feedUrl ?? safe.feed_url);

  return {
    id,
    title,
    publisher,
    description: cleanString(safe.description),
    artworkUrl: cleanString(safe.artworkUrl ?? safe.artwork_url ?? safe.imageUrl),
    feedUrl,
    websiteUrl: cleanOptionalString(safe.websiteUrl ?? safe.website_url),
    language: cleanString(safe.language, "unknown") || "unknown",
    country: cleanOptionalString(safe.country),
    categories,
    emotionalWorld: cleanOptionalString(safe.emotionalWorld ?? safe.emotional_world),
    isExplicit: Boolean(safe.isExplicit ?? safe.is_explicit),
    matureLevel,
    lastEpisodeDate: cleanOptionalString(safe.lastEpisodeDate ?? safe.last_episode_date),
    source: "rss",
  };
}

function normalizeSection(raw: unknown, fallbackIndex: number): PodcastHomeMetadataSection | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const shows = Array.isArray(row.shows)
    ? row.shows.map(normalizePodcastShow).filter((show): show is PodcastShow => show !== null)
    : [];

  if (!shows.length) return null;

  return {
    id: cleanString(row.id, `podcast-section-${fallbackIndex}`),
    title: cleanString(row.title, "Podcasts"),
    shows,
  };
}

function buildPodcastHomeUrl(options?: { page?: number; limit?: number; includeMature?: boolean }) {
  const params = new URLSearchParams();
  params.set("page", String(Math.max(1, Number(options?.page || 1))));
  params.set(
    "limit",
    String(Math.min(50, Math.max(1, Number(options?.limit || PODCAST_HOME_PAGE_LIMIT))))
  );
  params.set("includeMature", options?.includeMature ? "true" : "false");

  return `${PODCAST_CATALOG_BASE_URL}${PODCAST_HOME_API_PATH}?${params.toString()}`;
}

export async function fetchPodcastHomeMetadata(options?: {
  page?: number;
  limit?: number;
  includeMature?: boolean;
  signal?: AbortSignal;
}): Promise<PodcastHomeMetadataResponse> {
  try {
    const response = await fetch(buildPodcastHomeUrl(options), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: options?.signal,
    });
    const payload = (await response.json()) as Record<string, unknown>;

    if (!response.ok || payload.success === false) {
      return {
        success: false,
        sections: [],
        error: cleanString(payload.error, "Failed to load podcast metadata."),
      };
    }

    const rawSections = Array.isArray(payload.sections)
      ? payload.sections
      : Array.isArray(payload.shows)
      ? [
          {
            id: "all-podcasts",
            title: "Podcasts",
            shows: payload.shows,
          },
        ]
      : [];
    const sections = rawSections
      .map(normalizeSection)
      .filter((section): section is PodcastHomeMetadataSection => section !== null);

    return {
      success: sections.length > 0,
      sections,
      error: sections.length > 0 ? undefined : "Podcast metadata response was empty.",
    };
  } catch {
    return {
      success: false,
      sections: [],
      error: "Network error while loading podcast metadata.",
    };
  }
}

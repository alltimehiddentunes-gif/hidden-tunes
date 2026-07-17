/**
 * Typed client for the Next.js Artist Profile API on admin.hiddentunes.com.
 * Metadata only — no stream URLs. Playback stays on existing catalog/player paths.
 */

export const ARTIST_PROFILE_API_BASE_URL = "https://admin.hiddentunes.com";
export const ARTIST_PROFILE_DEFAULT_LIMIT = 20;
export const ARTIST_PROFILE_REQUEST_TIMEOUT_MS = 12_000;

export type ArtistProfileIdentity = {
  id: string;
  name: string;
  slug: string | null;
  artwork: string | null;
  bio: string | null;
  is_verified: boolean;
  is_featured: boolean;
  country_code: string | null;
  hometown: string | null;
  debut_year: number | null;
  website_url: string | null;
  genres: string[];
  explicit_rating: string;
};

export type ArtistProfileStatistics = {
  song_count: number;
  release_count: number;
  single_count: number;
  video_count: number;
  follower_count: number;
  monthly_listeners: number;
  total_plays: number;
  collaboration_count: number;
  refreshed_at: string | null;
};

export type ArtistProfileSection = {
  key: string;
  title: string;
  display_style: string;
  endpoint: string;
};

export type ArtistProfileShell = {
  artist: ArtistProfileIdentity;
  statistics: ArtistProfileStatistics;
  featured_release: ArtistProfileRelease | null;
  viewer: { is_following: boolean };
  sections: ArtistProfileSection[];
};

export type ArtistProfileSong = {
  id: string;
  title: string;
  slug: string | null;
  artist_id: string | null;
  album_id: string | null;
  album_title: string | null;
  genre: string | null;
  mood: string | null;
  artwork: string | null;
  duration_seconds: number | null;
  is_explicit: boolean;
  created_at: string | null;
};

export type ArtistProfileRelease = {
  id: string;
  title: string;
  slug: string | null;
  artist_id: string | null;
  artwork: string | null;
  release_year: number | null;
  release_type: string;
  track_count: number | null;
  created_at: string | null;
};

export type ArtistProfileAbout = {
  bio: string | null;
  sections: Array<Record<string, unknown>>;
  links: Array<Record<string, unknown>>;
};

export type ArtistProfileListPage<T> = {
  items: T[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  ranking?: {
    mode: "ranked" | "play_count" | "latest";
    label: "Popular tracks" | "Essential tracks";
    has_positive_scores: boolean;
  };
  release_filter?: string;
};

export const ARTIST_RELEASE_TYPE_LABELS: Record<string, string> = {
  album: "Album",
  single: "Single",
  ep: "EP",
  compilation: "Compilation",
  live: "Live",
  soundtrack: "Soundtrack",
  appearance: "Appearance",
  unknown: "Release",
};

export function artistReleaseTypeLabel(value: unknown) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  return ARTIST_RELEASE_TYPE_LABELS[key] || ARTIST_RELEASE_TYPE_LABELS.unknown;
}

export class ArtistProfileApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status = 500, details: unknown = null) {
    super(message);
    this.name = "ArtistProfileApiError";
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  method?: "GET" | "POST" | "DELETE";
  token?: string | null;
};

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function buildUrl(path: string, query?: Record<string, string | number | null | undefined>) {
  const url = new URL(path, ARTIST_PROFILE_API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value == null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function artistProfileRequest<T>(
  path: string,
  options: RequestOptions = {},
  query?: Record<string, string | number | null | undefined>,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? ARTIST_PROFILE_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const parentSignal = options.signal;
  const onParentAbort = () => controller.abort();
  if (parentSignal?.aborted) {
    controller.abort();
  } else if (parentSignal) {
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    const response = await fetch(buildUrl(path, query), {
      method: options.method || "GET",
      headers,
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new ArtistProfileApiError("Artist profile returned non-JSON.", response.status, {
        preview: text.slice(0, 200),
      });
    }

    if (!response.ok || payload.success === false) {
      throw new ArtistProfileApiError(
        cleanText(payload.error, `Artist profile request failed (${response.status})`),
        response.status,
        payload.details ?? null,
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ArtistProfileApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ArtistProfileApiError("Artist profile request timed out.", 408);
    }
    throw new ArtistProfileApiError(
      error instanceof Error ? error.message : "Artist profile request failed.",
      500,
    );
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}

function normalizeSong(row: unknown): ArtistProfileSong | null {
  const item = asObject(row);
  if (!item?.id) return null;
  return {
    id: String(item.id),
    title: cleanText(item.title, "Untitled"),
    slug: item.slug ? String(item.slug) : null,
    artist_id: item.artist_id ? String(item.artist_id) : null,
    album_id: item.album_id ? String(item.album_id) : null,
    album_title: item.album_title ? String(item.album_title) : null,
    genre: item.genre ? String(item.genre) : null,
    mood: item.mood ? String(item.mood) : null,
    artwork: item.artwork ? String(item.artwork) : null,
    duration_seconds:
      Number(item.duration_seconds) > 0 ? Number(item.duration_seconds) : null,
    is_explicit: item.is_explicit === true,
    created_at: item.created_at ? String(item.created_at) : null,
  };
}

function normalizeRelease(row: unknown): ArtistProfileRelease | null {
  const item = asObject(row);
  if (!item?.id) return null;
  return {
    id: String(item.id),
    title: cleanText(item.title, "Untitled"),
    slug: item.slug ? String(item.slug) : null,
    artist_id: item.artist_id ? String(item.artist_id) : null,
    artwork: item.artwork ? String(item.artwork) : null,
    release_year: Number(item.release_year) > 0 ? Number(item.release_year) : null,
    release_type: cleanText(item.release_type, "unknown"),
    track_count: Number(item.track_count) > 0 ? Number(item.track_count) : null,
    created_at: item.created_at ? String(item.created_at) : null,
  };
}

function normalizeListPage<T>(
  payload: Record<string, unknown>,
  mapItem: (row: unknown) => T | null,
): ArtistProfileListPage<T> {
  const items = Array.isArray(payload.items)
    ? (payload.items.map(mapItem).filter(Boolean) as T[])
    : [];
  const pagination = asObject(payload.pagination) || {};
  const ranking = asObject(payload.ranking);
  const mode = String(ranking?.mode || "");
  const label = String(ranking?.label || "");
  return {
    items,
    pagination: {
      limit: Number(pagination.limit) || items.length,
      hasMore: pagination.hasMore === true,
      nextCursor: pagination.nextCursor ? String(pagination.nextCursor) : null,
    },
    ...(ranking
      ? {
          ranking: {
            mode:
              mode === "ranked" || mode === "play_count" || mode === "latest"
                ? mode
                : "latest",
            label: label === "Popular tracks" ? "Popular tracks" : "Essential tracks",
            has_positive_scores: ranking.has_positive_scores === true,
          },
        }
      : {}),
    ...(payload.release_filter
      ? { release_filter: String(payload.release_filter) }
      : {}),
  };
}

export async function fetchArtistProfileShell(
  ref: string,
  options: RequestOptions = {},
): Promise<ArtistProfileShell> {
  const payload = await artistProfileRequest<{ success: boolean; profile: Record<string, unknown> }>(
    `/api/artists/${encodeURIComponent(ref)}`,
    options,
  );
  const profile = asObject(payload.profile);
  const artist = asObject(profile?.artist);
  if (!artist?.id || !artist?.name) {
    throw new ArtistProfileApiError("Artist profile shell missing identity.", 502);
  }

  const statistics = asObject(profile?.statistics) || {};
  const viewer = asObject(profile?.viewer) || {};
  const sections = Array.isArray(profile?.sections) ? profile!.sections : [];

  return {
    artist: {
      id: String(artist.id),
      name: cleanText(artist.name, "Unknown Artist"),
      slug: artist.slug ? String(artist.slug) : null,
      artwork: artist.artwork ? String(artist.artwork) : null,
      bio: artist.bio ? String(artist.bio) : null,
      is_verified: artist.is_verified === true,
      is_featured: artist.is_featured === true,
      country_code: artist.country_code ? String(artist.country_code) : null,
      hometown: artist.hometown ? String(artist.hometown) : null,
      debut_year: Number(artist.debut_year) > 0 ? Number(artist.debut_year) : null,
      website_url: artist.website_url ? String(artist.website_url) : null,
      genres: Array.isArray(artist.genres)
        ? artist.genres.map((genre) => String(genre)).filter(Boolean)
        : [],
      explicit_rating: cleanText(artist.explicit_rating, "unknown"),
    },
    statistics: {
      song_count: Number(statistics.song_count) || 0,
      release_count: Number(statistics.release_count) || 0,
      single_count: Number(statistics.single_count) || 0,
      video_count: Number(statistics.video_count) || 0,
      follower_count: Number(statistics.follower_count) || 0,
      monthly_listeners: Number(statistics.monthly_listeners) || 0,
      total_plays: Number(statistics.total_plays) || 0,
      collaboration_count: Number(statistics.collaboration_count) || 0,
      refreshed_at: statistics.refreshed_at ? String(statistics.refreshed_at) : null,
    },
    featured_release: normalizeRelease(profile?.featured_release),
    viewer: { is_following: viewer.is_following === true },
    sections: sections
      .map((section) => {
        const row = asObject(section);
        if (!row?.key) return null;
        return {
          key: String(row.key),
          title: cleanText(row.title, String(row.key)),
          display_style: cleanText(row.display_style, "list"),
          endpoint: cleanText(row.endpoint),
        };
      })
      .filter(Boolean) as ArtistProfileSection[],
  };
}

export async function fetchArtistTopSongs(
  ref: string,
  options: RequestOptions & { limit?: number; cursor?: string | null } = {},
) {
  const payload = await artistProfileRequest<Record<string, unknown>>(
    `/api/artists/${encodeURIComponent(ref)}/top-songs`,
    options,
    { limit: options.limit ?? ARTIST_PROFILE_DEFAULT_LIMIT, cursor: options.cursor },
  );
  return normalizeListPage(payload, normalizeSong);
}

export async function fetchArtistReleases(
  ref: string,
  options: RequestOptions & {
    limit?: number;
    cursor?: string | null;
    releaseType?: string | null;
  } = {},
) {
  const payload = await artistProfileRequest<Record<string, unknown>>(
    `/api/artists/${encodeURIComponent(ref)}/releases`,
    options,
    {
      limit: options.limit ?? ARTIST_PROFILE_DEFAULT_LIMIT,
      cursor: options.cursor,
      type: options.releaseType || undefined,
    },
  );
  return normalizeListPage(payload, normalizeRelease);
}

export async function fetchArtistSimilar(
  ref: string,
  options: RequestOptions & { limit?: number } = {},
) {
  const payload = await artistProfileRequest<Record<string, unknown>>(
    `/api/artists/${encodeURIComponent(ref)}/similar`,
    options,
    { limit: options.limit ?? ARTIST_PROFILE_DEFAULT_LIMIT },
  );
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items
    .map((row) => {
      const item = asObject(row);
      if (!item?.id) return null;
      return {
        id: String(item.id),
        name: cleanText(item.name, "Unknown Artist"),
        slug: item.slug ? String(item.slug) : null,
        artwork: item.artwork ? String(item.artwork) : null,
        is_verified: item.is_verified === true,
        similarity_score: Number(item.similarity_score) || 0,
      };
    })
    .filter(Boolean);
}

export async function fetchArtistAbout(
  ref: string,
  options: RequestOptions = {},
): Promise<ArtistProfileAbout> {
  const payload = await artistProfileRequest<{ success: boolean; about?: Record<string, unknown> }>(
    `/api/artists/${encodeURIComponent(ref)}/about`,
    options,
  );
  const about = asObject(payload.about) || {};
  return {
    bio: about.bio ? String(about.bio) : null,
    sections: Array.isArray(about.sections) ? about.sections : [],
    links: Array.isArray(about.links) ? about.links : [],
  };
}

export async function fetchArtistStats(
  ref: string,
  options: RequestOptions = {},
): Promise<ArtistProfileStatistics | null> {
  const payload = await artistProfileRequest<{ success: boolean; statistics?: Record<string, unknown> }>(
    `/api/artists/${encodeURIComponent(ref)}/stats`,
    options,
  );
  const statistics = asObject(payload.statistics);
  if (!statistics) return null;
  return {
    song_count: Number(statistics.song_count) || 0,
    release_count: Number(statistics.release_count) || 0,
    single_count: Number(statistics.single_count) || 0,
    video_count: Number(statistics.video_count) || 0,
    follower_count: Number(statistics.follower_count) || 0,
    monthly_listeners: Number(statistics.monthly_listeners) || 0,
    total_plays: Number(statistics.total_plays) || 0,
    collaboration_count: Number(statistics.collaboration_count) || 0,
    refreshed_at: statistics.refreshed_at ? String(statistics.refreshed_at) : null,
  };
}

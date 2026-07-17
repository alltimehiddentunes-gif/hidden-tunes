import { createClient, type User } from "@supabase/supabase-js";

import {
  buildContentCursorPage,
  decodeContentCursor,
  encodeContentCursor,
} from "@/lib/contentEngine/pagination";
import { invalidateArtistCache, withArtistCache } from "@/lib/artistProfileCache";
import { getSupabaseAdminConfig } from "@/lib/supabaseAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const ARTIST_DEFAULT_PAGE_SIZE = 20;
export const ARTIST_MAX_PAGE_SIZE = 40;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ARTIST_BASELINE_SELECT = "id, name, slug, image_url, bio, created_at";

export const ARTIST_PUBLIC_SELECT =
  "id, name, slug, image_url, bio, status, is_verified, is_featured, is_suspended, country_code, hometown, debut_year, website_url, profile_published_at, featured_release_id, merged_into_artist_id, explicit_rating, created_at, updated_at";

export const DEFAULT_PROFILE_SECTIONS = [
  {
    section_key: "top_songs",
    title_override: "Essential tracks",
    display_style: "list",
    endpoint_path: "top-songs",
  },
  {
    section_key: "releases",
    title_override: "Releases",
    display_style: "grid",
    endpoint_path: "releases",
  },
  { section_key: "singles", title_override: "Singles", display_style: "list", endpoint_path: "singles" },
  { section_key: "videos", title_override: "Videos", display_style: "grid", endpoint_path: "videos" },
  {
    section_key: "emotional_worlds",
    title_override: "Emotional worlds",
    display_style: "carousel",
    endpoint_path: "emotional-worlds",
  },
  { section_key: "similar", title_override: "Similar artists", display_style: "list", endpoint_path: "similar" },
  {
    section_key: "collaborations",
    title_override: "Collaborations",
    display_style: "list",
    endpoint_path: "collaborations",
  },
  { section_key: "credits", title_override: "Credits", display_style: "list", endpoint_path: "credits" },
  { section_key: "about", title_override: "About", display_style: "rich_text", endpoint_path: "about" },
  {
    section_key: "related_content",
    title_override: "Related content",
    display_style: "list",
    endpoint_path: "related-content",
  },
] as const;

const DEFAULT_SECTION_TITLES: Record<string, string> = {
  top_songs: "Essential tracks",
  releases: "Releases",
  singles: "Singles",
  videos: "Videos",
  emotional_worlds: "Emotional worlds",
  similar: "Similar artists",
  collaborations: "Collaborations",
  credits: "Credits",
  about: "About",
  related_content: "Related content",
};

export type ArtistRow = Record<string, unknown>;

export function isArtistUuid(value: string) {
  return UUID_RE.test(String(value || "").trim());
}

export function clampArtistPageSize(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return ARTIST_DEFAULT_PAGE_SIZE;
  return Math.min(ARTIST_MAX_PAGE_SIZE, Math.floor(parsed));
}

export function jsonArtistError(message: string, status = 400, details?: unknown) {
  return Response.json({ success: false, error: message, details: details ?? null }, { status });
}

export function serializeArtistError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isMissingArtistSchemaError(error: unknown) {
  const message = serializeArtistError(error).toLowerCase();
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";

  if (code === "42703" || code === "PGRST204" || code === "PGRST205" || code === "42P01") {
    return true;
  }

  return (
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("could not find the relationship")
  );
}

function cleanText(value: unknown, max = 4000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function decorateArtistDefaults(row: ArtistRow): ArtistRow {
  return {
    status: "published",
    is_verified: false,
    is_featured: false,
    is_suspended: false,
    explicit_rating: "unknown",
    country_code: null,
    hometown: null,
    debut_year: null,
    website_url: null,
    profile_published_at: null,
    merged_into_artist_id: null,
    featured_release_id: null,
    updated_at: row.created_at || null,
    ...row,
  };
}

function isArtistPubliclyVisible(row: ArtistRow) {
  if (row.merged_into_artist_id) return false;
  if (row.is_suspended === true) return false;
  return String(row.status || "published") === "published";
}

async function selectArtistRow(matcher: { id?: string; slug?: string }) {
  let extended = supabaseAdmin.from("artists").select(ARTIST_PUBLIC_SELECT);
  if (matcher.id) extended = extended.eq("id", matcher.id);
  if (matcher.slug) extended = extended.eq("slug", matcher.slug);
  const extendedResult = await extended.maybeSingle();

  if (!extendedResult.error) {
    return extendedResult.data ? decorateArtistDefaults(extendedResult.data as ArtistRow) : null;
  }

  if (!isMissingArtistSchemaError(extendedResult.error)) {
    throw new Error(extendedResult.error.message);
  }

  let baseline = supabaseAdmin.from("artists").select(ARTIST_BASELINE_SELECT);
  if (matcher.id) baseline = baseline.eq("id", matcher.id);
  if (matcher.slug) baseline = baseline.eq("slug", matcher.slug);
  const baselineResult = await baseline.maybeSingle();
  if (baselineResult.error) throw new Error(baselineResult.error.message);
  return baselineResult.data ? decorateArtistDefaults(baselineResult.data as ArtistRow) : null;
}

async function safeExactCount(
  table: string,
  filters: Array<{ column: string; value: unknown; op?: "eq" | "is" }>,
): Promise<number> {
  try {
    let query = supabaseAdmin.from(table).select("*", { count: "exact", head: true });
    for (const filter of filters) {
      if (filter.op === "is") {
        query = query.is(filter.column, filter.value as null);
      } else {
        query = query.eq(filter.column, filter.value as string | number | boolean);
      }
    }
    const { count, error } = await query;
    if (error) {
      if (isMissingArtistSchemaError(error)) return 0;
      throw new Error(error.message);
    }
    return count || 0;
  } catch (error) {
    if (isMissingArtistSchemaError(error)) return 0;
    throw error;
  }
}

async function safeOptionalRows<T>(
  label: string,
  run: () => PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>,
): Promise<T[]> {
  try {
    const { data, error } = await run();
    if (error) {
      if (isMissingArtistSchemaError(error)) return [];
      throw new Error(error.message || label);
    }
    return data || [];
  } catch (error) {
    if (isMissingArtistSchemaError(error)) return [];
    throw error;
  }
}

export function toPublicSong(row: Record<string, unknown>) {
  const artwork = row.cover_url || row.artwork_url || row.thumbnail_url || row.image_url || null;
  return {
    id: String(row.id),
    title: cleanText(row.title, 300) || "Untitled",
    slug: row.slug ? String(row.slug) : null,
    artist_id: row.artist_id ? String(row.artist_id) : null,
    album_id: row.album_id ? String(row.album_id) : null,
    album_title: row.album_title ? cleanText(row.album_title, 200) : row.album ? cleanText(row.album, 200) : null,
    genre: row.genre ? cleanText(row.genre, 120) : null,
    mood: row.mood ? cleanText(row.mood, 120) : null,
    artwork: artwork ? String(artwork) : null,
    duration_seconds:
      Number(row.duration_seconds ?? row.duration ?? 0) > 0
        ? Number(row.duration_seconds ?? row.duration)
        : null,
    is_explicit: row.is_explicit === true,
    created_at: row.created_at ? String(row.created_at) : null,
  };
}

export function toPublicRelease(row: Record<string, unknown>) {
  const artwork = row.artwork_url || row.cover_url || null;
  const releaseType = normalizeReleaseType(row.release_type);
  return {
    id: String(row.id),
    title: cleanText(row.title, 300) || "Untitled",
    slug: row.slug ? String(row.slug) : null,
    artist_id: row.artist_id ? String(row.artist_id) : null,
    artwork: artwork ? String(artwork) : null,
    release_year: row.release_year ? Number(row.release_year) : null,
    release_type: releaseType,
    track_count: row.track_count ? Number(row.track_count) : null,
    created_at: row.created_at ? String(row.created_at) : null,
  };
}

export const ARTIST_RELEASE_TYPES = [
  "album",
  "single",
  "ep",
  "compilation",
  "live",
  "soundtrack",
  "appearance",
  "unknown",
] as const;

export type ArtistReleaseType = (typeof ARTIST_RELEASE_TYPES)[number];

export function normalizeReleaseType(value: unknown): ArtistReleaseType {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if ((ARTIST_RELEASE_TYPES as readonly string[]).includes(key)) {
    return key as ArtistReleaseType;
  }
  return "unknown";
}

export type ArtistTrackRankingMode = "ranked" | "play_count" | "latest";

export type ArtistTrackListResult = {
  items: ReturnType<typeof toPublicSong>[];
  hasMore: boolean;
  nextCursor: string | null;
  ranking: {
    mode: ArtistTrackRankingMode;
    label: "Popular tracks" | "Essential tracks";
    has_positive_scores: boolean;
  };
};

export function toPublicArtistCard(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: cleanText(row.name, 200) || "Unknown Artist",
    slug: row.slug ? String(row.slug) : null,
    artwork: row.image_url ? String(row.image_url) : null,
    is_verified: row.is_verified === true,
  };
}

export async function resolveArtistRef(ref: string) {
  const key = String(ref || "").trim();
  if (!key) return null;

  const row = isArtistUuid(key)
    ? await selectArtistRow({ id: key })
    : await selectArtistRow({ slug: key });
  if (!row) return null;

  // Follow merge redirect before applying public visibility to the source row.
  if (row.merged_into_artist_id) {
    const canonical = await selectArtistRow({ id: String(row.merged_into_artist_id) });
    if (!canonical || !isArtistPubliclyVisible(canonical)) return null;
    return canonical;
  }

  if (!isArtistPubliclyVisible(row)) return null;
  return row;
}

async function loadArtistGenres(artistId: string) {
  const rows = await safeOptionalRows<{ genre?: unknown }>("artist_genres", () =>
    supabaseAdmin
      .from("artist_genres")
      .select("genre")
      .eq("artist_id", artistId)
      .order("sort_order", { ascending: true }),
  );
  return rows.map((row) => String(row.genre || "")).filter(Boolean);
}

async function loadArtistStatistics(artistId: string) {
  const rows = await safeOptionalRows<Record<string, unknown>>("artist_statistics", () =>
    supabaseAdmin.from("artist_statistics").select("*").eq("artist_id", artistId).limit(1),
  );
  if (rows[0]) return rows[0];

  const [songCount, albumCount, videoCount, followerCount, collaborationCount] = await Promise.all([
    safeExactCount("songs", [
      { column: "artist_id", value: artistId },
      { column: "is_public", value: true },
    ]),
    safeExactCount("albums", [{ column: "artist_id", value: artistId }]),
    safeExactCount("artist_videos", [
      { column: "artist_id", value: artistId },
      { column: "is_published", value: true },
    ]),
    safeExactCount("artist_followers", [{ column: "artist_id", value: artistId }]),
    safeExactCount("artist_collaborations", [
      { column: "artist_id", value: artistId },
      { column: "is_published", value: true },
    ]),
  ]);

  return {
    song_count: songCount,
    release_count: albumCount,
    single_count: 0,
    video_count: videoCount,
    follower_count: followerCount,
    monthly_listeners: 0,
    total_plays: 0,
    collaboration_count: collaborationCount,
    refreshed_at: new Date().toISOString(),
  };
}

async function loadSectionCounts(artistId: string, stats: Record<string, unknown>) {
  const [worlds, similar, credits, related, aboutSections] = await Promise.all([
    safeExactCount("artist_emotional_worlds", [
      { column: "artist_id", value: artistId },
      { column: "is_published", value: true },
    ]),
    safeExactCount("artist_similar_scores", [{ column: "artist_id", value: artistId }]),
    safeExactCount("artist_credits", [
      { column: "artist_id", value: artistId },
      { column: "is_published", value: true },
    ]),
    safeExactCount("artist_related_content", [
      { column: "artist_id", value: artistId },
      { column: "is_published", value: true },
    ]),
    safeExactCount("artist_biography_sections", [
      { column: "artist_id", value: artistId },
      { column: "is_published", value: true },
    ]),
  ]);

  return {
    top_songs: Number(stats.song_count || 0),
    releases: Number(stats.release_count || 0),
    singles: Number(stats.single_count || 0),
    videos: Number(stats.video_count || 0),
    emotional_worlds: worlds,
    similar,
    collaborations: Number(stats.collaboration_count || 0),
    credits,
    about: aboutSections > 0 ? aboutSections : 1,
    related_content: related,
  } as Record<string, number>;
}

async function loadProfileSections(artistId: string, stats: Record<string, unknown>) {
  const configured = await safeOptionalRows<Record<string, unknown>>("artist_profile_sections", () =>
    supabaseAdmin
      .from("artist_profile_sections")
      .select("section_key, title_override, display_style, endpoint_path, sort_order, is_enabled")
      .eq("artist_id", artistId)
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true }),
  );

  const source =
    configured.length > 0
      ? configured
      : DEFAULT_PROFILE_SECTIONS.map((section, index) => ({
          ...section,
          sort_order: index * 10,
          is_enabled: true,
        }));

  const countByKey = await loadSectionCounts(artistId, stats);

  const sections = [];
  for (const row of source) {
    const key = String(row.section_key);
    const count = countByKey[key];
    if (
      key !== "about" &&
      key !== "related_content" &&
      key !== "top_songs" &&
      key !== "releases" &&
      (!count || count <= 0)
    ) {
      continue;
    }
    sections.push({
      key,
      title: row.title_override
        ? String(row.title_override)
        : DEFAULT_SECTION_TITLES[key] ||
          key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      display_style: String(row.display_style || "list"),
      endpoint: `/api/artists/${artistId}/${String(row.endpoint_path || key)}`,
    });
  }
  return sections;
}

async function loadFeaturedRelease(artistRow: ArtistRow) {
  const releaseId = artistRow.featured_release_id ? String(artistRow.featured_release_id) : "";
  if (!releaseId) return null;
  const withType =
    "id, title, slug, artwork_url, cover_url, release_year, release_type, artist_id, created_at";
  const baseline =
    "id, title, slug, artwork_url, cover_url, release_year, artist_id, created_at";

  let result = await supabaseAdmin.from("albums").select(withType).eq("id", releaseId).maybeSingle();
  if (result.error && isMissingArtistSchemaError(result.error)) {
    result = await supabaseAdmin.from("albums").select(baseline).eq("id", releaseId).maybeSingle();
  }
  const { data } = result;
  return data ? toPublicRelease(data as Record<string, unknown>) : null;
}

export async function loadArtistIdentity(artistRow: ArtistRow) {
  const genres = await loadArtistGenres(String(artistRow.id));
  return {
    id: String(artistRow.id),
    name: cleanText(artistRow.name, 200) || "Unknown Artist",
    slug: artistRow.slug ? String(artistRow.slug) : null,
    artwork: artistRow.image_url ? String(artistRow.image_url) : null,
    bio: artistRow.bio ? cleanText(artistRow.bio, 5000) : null,
    is_verified: artistRow.is_verified === true,
    is_featured: artistRow.is_featured === true,
    country_code: artistRow.country_code ? String(artistRow.country_code) : null,
    hometown: artistRow.hometown ? String(artistRow.hometown) : null,
    debut_year: artistRow.debut_year ? Number(artistRow.debut_year) : null,
    website_url: artistRow.website_url ? String(artistRow.website_url) : null,
    genres,
    explicit_rating: String(artistRow.explicit_rating || "unknown"),
  };
}

export async function isViewerFollowingArtist(artistId: string, viewerUserId: string | null) {
  if (!viewerUserId) return false;
  const rows = await safeOptionalRows<{ artist_id?: unknown }>("artist_followers", () =>
    supabaseAdmin
      .from("artist_followers")
      .select("artist_id")
      .eq("artist_id", artistId)
      .eq("user_id", viewerUserId)
      .limit(1),
  );
  return rows.length > 0;
}

export async function loadArtistProfileShell(ref: string, viewerUserId: string | null = null) {
  const cacheKey = `artist:shell:${ref}:${viewerUserId || "anon"}`;
  return withArtistCache(cacheKey, async () => {
    const artistRow = await resolveArtistRef(ref);
    if (!artistRow) return null;
    const artistId = String(artistRow.id);
    const statistics = await loadArtistStatistics(artistId);
    const [artist, featured_release, sections, is_following] = await Promise.all([
      loadArtistIdentity(artistRow),
      loadFeaturedRelease(artistRow),
      loadProfileSections(artistId, statistics),
      isViewerFollowingArtist(artistId, viewerUserId),
    ]);

    return {
      artist,
      statistics: {
        song_count: Number(statistics.song_count || 0),
        release_count: Number(statistics.release_count || 0),
        single_count: Number(statistics.single_count || 0),
        video_count: Number(statistics.video_count || 0),
        follower_count: Number(statistics.follower_count || 0),
        monthly_listeners: Number(statistics.monthly_listeners || 0),
        total_plays: Number(statistics.total_plays || 0),
        collaboration_count: Number(statistics.collaboration_count || 0),
        refreshed_at: statistics.refreshed_at ? String(statistics.refreshed_at) : null,
      },
      featured_release,
      viewer: { is_following },
      sections,
    };
  });
}

export async function loadArtistTopSongs(
  artistId: string,
  options: { limit?: number; cursor?: string | null } = {},
): Promise<ArtistTrackListResult> {
  const limit = clampArtistPageSize(options.limit);
  const scope = `artist-top-songs:${artistId}`;
  const decoded = decodeContentCursor(options.cursor, scope);

  const { data: rankings, error: rankingsError } = await supabaseAdmin
    .from("artist_song_rankings")
    .select("rank_position, play_score, songs:song_id(id, title, slug, artist_id, album_id, genre, mood, duration, duration_seconds, cover_url, artwork_url, created_at, is_public)")
    .eq("artist_id", artistId)
    .order("rank_position", { ascending: true })
    .limit(limit + 1);

  if (rankingsError && !isMissingArtistSchemaError(rankingsError)) {
    throw new Error(rankingsError.message);
  }

  if (!rankingsError && rankings && rankings.length > 0) {
    let rows = rankings;
    if (decoded) {
      const startRank = Number(decoded.sortValue);
      rows = rankings.filter((row) => Number(row.rank_position) > startRank);
    }
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows
      .map((row) => {
        const song = row.songs as Record<string, unknown> | Record<string, unknown>[] | null;
        const songRow = Array.isArray(song) ? song[0] : song;
        return songRow && songRow.is_public !== false ? toPublicSong(songRow) : null;
      })
      .filter(Boolean) as ReturnType<typeof toPublicSong>[];
    const last = pageRows[pageRows.length - 1];
    const lastSong = last.songs as Record<string, unknown> | Record<string, unknown>[] | null;
    const lastSongRow = Array.isArray(lastSong) ? lastSong[0] : lastSong;
    return {
      items,
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeContentCursor({
              v: 1,
              scope,
              sortValue: String(last.rank_position),
              id: String(lastSongRow?.id || last.rank_position),
            })
          : null,
      ranking: {
        mode: "ranked",
        label: "Popular tracks",
        has_positive_scores: true,
      },
    };
  }

  // Honest live fallback: only label Popular when real play_count > 0 exists.
  const playCountProbe = await supabaseAdmin
    .from("songs")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId)
    .eq("is_public", true)
    .gt("play_count", 0);

  const hasPositivePlayCounts =
    !playCountProbe.error && Number(playCountProbe.count || 0) > 0;

  if (hasPositivePlayCounts) {
    let query = supabaseAdmin
      .from("songs")
      .select(
        "id, title, slug, artist_id, album_id, genre, mood, duration, duration_seconds, cover_url, artwork_url, created_at, is_public, play_count",
      )
      .eq("artist_id", artistId)
      .eq("is_public", true)
      .order("play_count", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (decoded) {
      query = query.or(
        `play_count.lt.${decoded.sortValue},and(play_count.eq.${decoded.sortValue},id.lt.${decoded.id})`,
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = data || [];
    const playCountById = new Map(
      rows.map((row) => [String(row.id), Number(row.play_count) || 0] as const),
    );
    const page = buildContentCursorPage({
      items: rows.map((row) => toPublicSong(row as Record<string, unknown>)),
      limit,
      scope,
      getSortValue: (item) => String(playCountById.get(item.id) || 0),
      getId: (item) => item.id,
    });
    return {
      ...page,
      ranking: {
        mode: "play_count",
        label: "Popular tracks",
        has_positive_scores: true,
      },
    };
  }

  let query = supabaseAdmin
    .from("songs")
    .select("id, title, slug, artist_id, album_id, genre, mood, duration, duration_seconds, cover_url, artwork_url, created_at, is_public")
    .eq("artist_id", artistId)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (decoded) {
    query = query.or(`created_at.lt.${decoded.sortValue},and(created_at.eq.${decoded.sortValue},id.lt.${decoded.id})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const items = (data || []).map((row) => toPublicSong(row as Record<string, unknown>));
  const page = buildContentCursorPage({
    items,
    limit,
    scope,
    getSortValue: (item) => String(item.created_at || ""),
    getId: (item) => item.id,
  });
  return {
    ...page,
    ranking: {
      mode: "latest",
      label: "Essential tracks",
      has_positive_scores: false,
    },
  };
}

export async function loadArtistSingles(artistId: string, options: { limit?: number; cursor?: string | null } = {}) {
  const limit = clampArtistPageSize(options.limit);
  const scope = `artist-singles:${artistId}`;
  const decoded = decodeContentCursor(options.cursor, scope);

  let query = supabaseAdmin
    .from("songs")
    .select("id, title, slug, artist_id, album_id, genre, mood, duration, duration_seconds, cover_url, artwork_url, created_at, is_public")
    .eq("artist_id", artistId)
    .eq("is_public", true)
    .is("album_id", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (decoded) {
    query = query.or(`created_at.lt.${decoded.sortValue},and(created_at.eq.${decoded.sortValue},id.lt.${decoded.id})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const items = (data || []).map((row) => toPublicSong(row as Record<string, unknown>));
  return buildContentCursorPage({
    items,
    limit,
    scope,
    getSortValue: (item) => String(item.created_at || ""),
    getId: (item) => item.id,
  });
}

export async function loadArtistReleases(
  artistId: string,
  options: { limit?: number; cursor?: string | null; releaseType?: string | null } = {},
) {
  const limit = clampArtistPageSize(options.limit);
  const requestedType = options.releaseType
    ? normalizeReleaseType(options.releaseType)
    : null;
  // "all" means no filter; unknown/null options.releaseType also means no filter.
  const filterType =
    options.releaseType && String(options.releaseType).toLowerCase() !== "all"
      ? requestedType
      : null;
  const scope = `artist-releases:${artistId}:${filterType || "all"}`;
  const decoded = decodeContentCursor(options.cursor, scope);

  const selectWithType =
    "id, title, slug, artist_id, artwork_url, cover_url, release_year, release_type, created_at";
  const selectBaseline =
    "id, title, slug, artist_id, artwork_url, cover_url, release_year, created_at";

  async function runQuery(selectClause: string, includeTypeFilter: boolean) {
    let query = supabaseAdmin
      .from("albums")
      .select(selectClause)
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (includeTypeFilter && filterType && filterType !== "unknown") {
      query = query.eq("release_type", filterType);
    } else if (includeTypeFilter && filterType === "unknown") {
      query = query.or("release_type.eq.unknown,release_type.is.null");
    }

    if (decoded) {
      query = query.or(
        `created_at.lt.${decoded.sortValue},and(created_at.eq.${decoded.sortValue},id.lt.${decoded.id})`,
      );
    }

    return query;
  }

  let result = await runQuery(selectWithType, Boolean(filterType));
  let hasReleaseTypeColumn = true;

  if (result.error && isMissingArtistSchemaError(result.error)) {
    hasReleaseTypeColumn = false;
    if (filterType && filterType !== "album" && filterType !== "unknown") {
      // Trusted release_type column absent: cannot honestly filter specialty types.
      return {
        items: [] as ReturnType<typeof toPublicRelease>[],
        hasMore: false,
        nextCursor: null,
      };
    }
    result = await runQuery(selectBaseline, false);
  }

  if (result.error) throw new Error(result.error.message);

  const items = (result.data || []).map((row) =>
    toPublicRelease({
      ...(row as Record<string, unknown>),
      release_type: hasReleaseTypeColumn
        ? (row as Record<string, unknown>).release_type
        : "unknown",
    }),
  );

  return buildContentCursorPage({
    items,
    limit,
    scope,
    getSortValue: (item) => String(item.created_at || ""),
    getId: (item) => item.id,
  });
}

export async function loadArtistVideos(artistId: string, options: { limit?: number; cursor?: string | null } = {}) {
  const limit = clampArtistPageSize(options.limit);
  const scope = `artist-videos:${artistId}`;
  const decoded = decodeContentCursor(options.cursor, scope);

  let query = supabaseAdmin
    .from("artist_videos")
    .select("id, title, slug, description, thumbnail_url, duration_seconds, is_explicit, published_at, sort_order")
    .eq("artist_id", artistId)
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);

  if (decoded) query = query.gt("sort_order", Number(decoded.sortValue));

  const { data, error } = await query;
  if (error) {
    if (isMissingArtistSchemaError(error)) {
      return { items: [] as Array<Record<string, unknown>>, hasMore: false, nextCursor: null };
    }
    throw new Error(error.message);
  }
  const items = (data || []).map((row) => ({
    id: String(row.id),
    title: cleanText(row.title, 300),
    slug: row.slug ? String(row.slug) : null,
    description: row.description ? cleanText(row.description, 2000) : null,
    artwork: row.thumbnail_url ? String(row.thumbnail_url) : null,
    duration_seconds: row.duration_seconds ? Number(row.duration_seconds) : null,
    is_explicit: row.is_explicit === true,
    published_at: row.published_at ? String(row.published_at) : null,
  }));
  return buildContentCursorPage({
    items,
    limit,
    scope,
    getSortValue: (item) => String(item.published_at || item.id),
    getId: (item) => item.id,
  });
}

export async function loadArtistSimilar(artistId: string, limitInput?: number) {
  const limit = clampArtistPageSize(limitInput);
  const { data, error } = await supabaseAdmin
    .from("artist_similar_scores")
    .select("similarity_score, artists:similar_artist_id(id, name, slug, image_url, is_verified)")
    .eq("artist_id", artistId)
    .order("similarity_score", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingArtistSchemaError(error)) return [];
    throw new Error(error.message);
  }
  return (data || [])
    .map((row) => {
      const artist = row.artists as Record<string, unknown> | Record<string, unknown>[] | null;
      const card = Array.isArray(artist) ? artist[0] : artist;
      return card ? { ...toPublicArtistCard(card), similarity_score: Number(row.similarity_score || 0) } : null;
    })
    .filter(Boolean);
}

export async function loadArtistCollaborations(artistId: string, limitInput?: number) {
  const limit = clampArtistPageSize(limitInput);
  const { data, error } = await supabaseAdmin
    .from("artist_collaborations")
    .select("collaboration_score, song_count, artists:collaborator_artist_id(id, name, slug, image_url, is_verified)")
    .eq("artist_id", artistId)
    .eq("is_published", true)
    .order("collaboration_score", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingArtistSchemaError(error)) return [];
    throw new Error(error.message);
  }
  return (data || [])
    .map((row) => {
      const artist = row.artists as Record<string, unknown> | Record<string, unknown>[] | null;
      const card = Array.isArray(artist) ? artist[0] : artist;
      return card
        ? { ...toPublicArtistCard(card), collaboration_score: Number(row.collaboration_score || 0), song_count: Number(row.song_count || 0) }
        : null;
    })
    .filter(Boolean);
}

export async function loadArtistCredits(artistId: string, limitInput?: number) {
  const limit = clampArtistPageSize(limitInput);
  const { data, error } = await supabaseAdmin
    .from("artist_credits")
    .select("id, credit_type, credit_title, related_song_id, related_album_id, related_artist_id, sort_order")
    .eq("artist_id", artistId)
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .limit(limit);
  if (error) {
    if (isMissingArtistSchemaError(error)) return [];
    throw new Error(error.message);
  }
  return data || [];
}

export async function loadArtistAbout(artistId: string) {
  const [sections, links, artistRow] = await Promise.all([
    safeOptionalRows<Record<string, unknown>>("artist_biography_sections", () =>
      supabaseAdmin
        .from("artist_biography_sections")
        .select("section_key, title, body, sort_order")
        .eq("artist_id", artistId)
        .eq("is_published", true)
        .order("sort_order", { ascending: true }),
    ),
    safeOptionalRows<Record<string, unknown>>("artist_external_links", () =>
      supabaseAdmin
        .from("artist_external_links")
        .select("label, url, link_type, sort_order")
        .eq("artist_id", artistId)
        .eq("is_published", true)
        .order("sort_order", { ascending: true }),
    ),
    resolveArtistRef(artistId),
  ]);
  return { bio: artistRow?.bio ? cleanText(artistRow.bio, 8000) : null, sections, links };
}

export async function loadArtistEmotionalWorlds(artistId: string, limitInput?: number) {
  const limit = clampArtistPageSize(limitInput);
  const { data, error } = await supabaseAdmin
    .from("artist_emotional_worlds")
    .select("world_key, title, description, song_count, artwork_url, sort_order")
    .eq("artist_id", artistId)
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .limit(limit);
  if (error) {
    if (isMissingArtistSchemaError(error)) return [];
    throw new Error(error.message);
  }
  return data || [];
}

export async function loadArtistEmotionalWorldDetail(artistId: string, worldKey: string, limitInput?: number) {
  const limit = clampArtistPageSize(limitInput);
  const { data: world, error } = await supabaseAdmin
    .from("artist_emotional_worlds")
    .select("world_key, title, description, song_count, artwork_url")
    .eq("artist_id", artistId)
    .eq("world_key", worldKey)
    .eq("is_published", true)
    .maybeSingle();
  if (error) {
    if (isMissingArtistSchemaError(error)) return null;
    throw new Error(error.message);
  }
  if (!world) return null;

  const { data: songs, error: songsError } = await supabaseAdmin
    .from("songs")
    .select("id, title, slug, artist_id, album_id, genre, mood, atmosphere, emotion, energy, duration_seconds, duration, cover_url, artwork_url, created_at")
    .eq("artist_id", artistId)
    .eq("is_public", true)
    .or(`emotion.ilike.%${worldKey}%,atmosphere.ilike.%${worldKey}%,mood.ilike.%${worldKey}%`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (songsError) throw new Error(songsError.message);
  return { world, items: (songs || []).map((row) => toPublicSong(row as Record<string, unknown>)) };
}

export async function loadArtistRelatedContent(artistId: string, limitInput?: number) {
  const limit = clampArtistPageSize(limitInput);
  const { data, error } = await supabaseAdmin
    .from("artist_related_content")
    .select("content_type, content_id, title, subtitle, artwork_url, sort_order")
    .eq("artist_id", artistId)
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .limit(limit);
  if (error) {
    if (isMissingArtistSchemaError(error)) return [];
    throw new Error(error.message);
  }
  return data || [];
}

export async function followArtist(artistId: string, userId: string) {
  const artist = await resolveArtistRef(artistId);
  if (!artist) {
    const notFound = new Error("Artist not found.");
    (notFound as Error & { status?: number }).status = 404;
    throw notFound;
  }
  const { error } = await supabaseAdmin.from("artist_followers").upsert({ artist_id: artistId, user_id: userId });
  if (error) {
    if (isMissingArtistSchemaError(error)) {
      const unavailable = new Error("Artist follow is unavailable until profile infrastructure is applied.");
      (unavailable as Error & { status?: number }).status = 503;
      throw unavailable;
    }
    throw new Error(error.message);
  }
  invalidateArtistCache(artistId);
  return { followed: true };
}

export async function unfollowArtist(artistId: string, userId: string) {
  const { error } = await supabaseAdmin.from("artist_followers").delete().eq("artist_id", artistId).eq("user_id", userId);
  if (error) {
    if (isMissingArtistSchemaError(error)) {
      const unavailable = new Error("Artist unfollow is unavailable until profile infrastructure is applied.");
      (unavailable as Error & { status?: number }).status = 503;
      throw unavailable;
    }
    throw new Error(error.message);
  }
  invalidateArtistCache(artistId);
  return { followed: false };
}

export async function getViewerFromAuthorizationHeader(authorization: string | null) {
  const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const config = getSupabaseAdminConfig();
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    "";
  if (!config.supabaseUrl || !anonKey) return null;
  const client = createClient(config.supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user as User;
}

export async function loadArtistStatsOnly(ref: string) {
  const artist = await resolveArtistRef(ref);
  if (!artist) return null;
  const stats = await loadArtistStatistics(String(artist.id));
  return {
    artist_id: String(artist.id),
    song_count: Number(stats.song_count || 0),
    release_count: Number(stats.release_count || 0),
    single_count: Number(stats.single_count || 0),
    video_count: Number(stats.video_count || 0),
    follower_count: Number(stats.follower_count || 0),
    monthly_listeners: Number(stats.monthly_listeners || 0),
    total_plays: Number(stats.total_plays || 0),
    collaboration_count: Number(stats.collaboration_count || 0),
    refreshed_at: stats.refreshed_at ? String(stats.refreshed_at) : null,
  };
}

export function buildArtistListResponse<T>(items: T[], nextCursor: string | null, hasMore: boolean) {
  return { success: true, items, pagination: { limit: items.length, hasMore, nextCursor } };
}

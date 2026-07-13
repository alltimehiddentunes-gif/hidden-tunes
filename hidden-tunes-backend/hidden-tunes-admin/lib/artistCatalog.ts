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

export const ARTIST_PUBLIC_SELECT =
  "id, name, slug, image_url, bio, status, is_verified, is_featured, is_suspended, country_code, hometown, debut_year, website_url, profile_published_at, featured_release_id, merged_into_artist_id, explicit_rating, created_at, updated_at";

export const DEFAULT_PROFILE_SECTIONS = [
  { section_key: "top_songs", title_override: null, display_style: "list", endpoint_path: "top-songs" },
  { section_key: "releases", title_override: null, display_style: "grid", endpoint_path: "releases" },
  { section_key: "singles", title_override: null, display_style: "list", endpoint_path: "singles" },
  { section_key: "videos", title_override: null, display_style: "grid", endpoint_path: "videos" },
  { section_key: "emotional_worlds", title_override: null, display_style: "carousel", endpoint_path: "emotional-worlds" },
  { section_key: "similar", title_override: null, display_style: "list", endpoint_path: "similar" },
  { section_key: "collaborations", title_override: null, display_style: "list", endpoint_path: "collaborations" },
  { section_key: "credits", title_override: null, display_style: "list", endpoint_path: "credits" },
  { section_key: "about", title_override: null, display_style: "rich_text", endpoint_path: "about" },
  { section_key: "related_content", title_override: null, display_style: "list", endpoint_path: "related-content" },
] as const;

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

function cleanText(value: unknown, max = 4000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isArtistPubliclyVisible(row: ArtistRow) {
  if (row.merged_into_artist_id) return false;
  if (row.is_suspended === true) return false;
  return String(row.status || "published") === "published";
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
  return {
    id: String(row.id),
    title: cleanText(row.title, 300) || "Untitled",
    slug: row.slug ? String(row.slug) : null,
    artist_id: row.artist_id ? String(row.artist_id) : null,
    artwork: artwork ? String(artwork) : null,
    release_year: row.release_year ? Number(row.release_year) : null,
    release_type: row.release_type ? String(row.release_type) : "album",
    track_count: row.track_count ? Number(row.track_count) : null,
    created_at: row.created_at ? String(row.created_at) : null,
  };
}

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

  let query = supabaseAdmin.from("artists").select(ARTIST_PUBLIC_SELECT);
  query = isArtistUuid(key) ? query.eq("id", key) : query.eq("slug", key);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as ArtistRow;
  if (!isArtistPubliclyVisible(row)) return null;

  if (row.merged_into_artist_id) {
    const { data: canonical } = await supabaseAdmin
      .from("artists")
      .select(ARTIST_PUBLIC_SELECT)
      .eq("id", String(row.merged_into_artist_id))
      .maybeSingle();
    return (canonical as ArtistRow | null) || null;
  }

  return row;
}

async function loadArtistGenres(artistId: string) {
  const { data } = await supabaseAdmin
    .from("artist_genres")
    .select("genre")
    .eq("artist_id", artistId)
    .order("sort_order", { ascending: true });
  return (data || []).map((row) => String(row.genre)).filter(Boolean);
}

async function loadArtistStatistics(artistId: string) {
  const { data } = await supabaseAdmin
    .from("artist_statistics")
    .select("*")
    .eq("artist_id", artistId)
    .maybeSingle();
  if (data) return data as Record<string, unknown>;

  const [songs, albums, videos, followers, collaborations] = await Promise.all([
    supabaseAdmin.from("songs").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_public", true),
    supabaseAdmin.from("albums").select("id", { count: "exact", head: true }).eq("artist_id", artistId),
    supabaseAdmin.from("artist_videos").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_published", true),
    supabaseAdmin.from("artist_followers").select("user_id", { count: "exact", head: true }).eq("artist_id", artistId),
    supabaseAdmin.from("artist_collaborations").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_published", true),
  ]);

  return {
    song_count: songs.count || 0,
    release_count: albums.count || 0,
    single_count: 0,
    video_count: videos.count || 0,
    follower_count: followers.count || 0,
    monthly_listeners: 0,
    total_plays: 0,
    collaboration_count: collaborations.count || 0,
    refreshed_at: new Date().toISOString(),
  };
}

async function loadSectionCounts(artistId: string, stats: Record<string, unknown>) {
  const [worlds, similar, credits, related, aboutSections] = await Promise.all([
    supabaseAdmin.from("artist_emotional_worlds").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_published", true),
    supabaseAdmin.from("artist_similar_scores").select("similar_artist_id", { count: "exact", head: true }).eq("artist_id", artistId),
    supabaseAdmin.from("artist_credits").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_published", true),
    supabaseAdmin.from("artist_related_content").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_published", true),
    supabaseAdmin.from("artist_biography_sections").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("is_published", true),
  ]);

  return {
    top_songs: Number(stats.song_count || 0),
    releases: Number(stats.release_count || 0),
    singles: Number(stats.single_count || 0),
    videos: Number(stats.video_count || 0),
    emotional_worlds: worlds.count || 0,
    similar: similar.count || 0,
    collaborations: Number(stats.collaboration_count || 0),
    credits: credits.count || 0,
    about: (aboutSections.count || 0) > 0 ? aboutSections.count || 0 : 1,
    related_content: related.count || 0,
  } as Record<string, number>;
}

async function loadProfileSections(artistId: string, stats: Record<string, unknown>) {
  const { data } = await supabaseAdmin
    .from("artist_profile_sections")
    .select("section_key, title_override, display_style, endpoint_path, sort_order, is_enabled")
    .eq("artist_id", artistId)
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });

  const rows = (data || []) as Array<Record<string, unknown>>;
  const source =
    rows.length > 0
      ? rows
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
    if (key !== "about" && key !== "related_content" && key !== "top_songs" && key !== "releases" && (!count || count <= 0)) {
      continue;
    }
    sections.push({
      key,
      title: row.title_override
        ? String(row.title_override)
        : key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      display_style: String(row.display_style || "list"),
      endpoint: `/api/artists/${artistId}/${String(row.endpoint_path || key)}`,
    });
  }
  return sections;
}

async function loadFeaturedRelease(artistRow: ArtistRow) {
  const releaseId = artistRow.featured_release_id ? String(artistRow.featured_release_id) : "";
  if (!releaseId) return null;
  const { data } = await supabaseAdmin
    .from("albums")
    .select("id, title, slug, artwork_url, cover_url, release_year, artist_id, created_at")
    .eq("id", releaseId)
    .maybeSingle();
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
  const { data } = await supabaseAdmin
    .from("artist_followers")
    .select("artist_id")
    .eq("artist_id", artistId)
    .eq("user_id", viewerUserId)
    .maybeSingle();
  return Boolean(data);
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

export async function loadArtistTopSongs(artistId: string, options: { limit?: number; cursor?: string | null } = {}) {
  const limit = clampArtistPageSize(options.limit);
  const scope = `artist-top-songs:${artistId}`;
  const decoded = decodeContentCursor(options.cursor, scope);

  const { data: rankings, error: rankingsError } = await supabaseAdmin
    .from("artist_song_rankings")
    .select("rank_position, play_score, songs:song_id(id, title, slug, artist_id, album_id, genre, mood, duration, duration_seconds, cover_url, artwork_url, created_at, is_public)")
    .eq("artist_id", artistId)
    .order("rank_position", { ascending: true })
    .limit(limit + 1);

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
  return buildContentCursorPage({
    items,
    limit,
    scope,
    getSortValue: (item) => String(item.created_at || ""),
    getId: (item) => item.id,
  });
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

export async function loadArtistReleases(artistId: string, options: { limit?: number; cursor?: string | null; releaseType?: string | null } = {}) {
  const limit = clampArtistPageSize(options.limit);
  const scope = `artist-releases:${artistId}:${options.releaseType || "all"}`;
  const decoded = decodeContentCursor(options.cursor, scope);

  let query = supabaseAdmin
    .from("albums")
    .select("id, title, slug, artist_id, artwork_url, cover_url, release_year, created_at")
    .eq("artist_id", artistId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (decoded) {
    query = query.or(`created_at.lt.${decoded.sortValue},and(created_at.eq.${decoded.sortValue},id.lt.${decoded.id})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const items = (data || []).map((row) => toPublicRelease({ ...(row as Record<string, unknown>), release_type: options.releaseType || "album" }));
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
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
  return data || [];
}

export async function loadArtistAbout(artistId: string) {
  const [{ data: sections }, { data: links }, artistRow] = await Promise.all([
    supabaseAdmin.from("artist_biography_sections").select("section_key, title, body, sort_order").eq("artist_id", artistId).eq("is_published", true).order("sort_order", { ascending: true }),
    supabaseAdmin.from("artist_external_links").select("label, url, link_type, sort_order").eq("artist_id", artistId).eq("is_published", true).order("sort_order", { ascending: true }),
    resolveArtistRef(artistId),
  ]);
  return { bio: artistRow?.bio ? cleanText(artistRow.bio, 8000) : null, sections: sections || [], links: links || [] };
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
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
  return data || [];
}

export async function followArtist(artistId: string, userId: string) {
  const artist = await resolveArtistRef(artistId);
  if (!artist) throw new Error("Artist not found.");
  const { error } = await supabaseAdmin.from("artist_followers").upsert({ artist_id: artistId, user_id: userId });
  if (error) throw new Error(error.message);
  invalidateArtistCache(artistId);
  return { followed: true };
}

export async function unfollowArtist(artistId: string, userId: string) {
  const { error } = await supabaseAdmin.from("artist_followers").delete().eq("artist_id", artistId).eq("user_id", userId);
  if (error) throw new Error(error.message);
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

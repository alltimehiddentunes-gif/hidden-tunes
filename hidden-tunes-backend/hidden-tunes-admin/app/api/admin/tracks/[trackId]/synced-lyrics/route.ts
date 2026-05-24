import { NextRequest, NextResponse } from "next/server";

import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildSyncedPayload,
  parseLrcToSyncedLines,
  sanitizeSyncedLyricsJson,
} from "@/lib/syncedLyricsUtils";
import type { SyncedLyricLine } from "@/lib/syncedLyricsTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    trackId: string;
  }>;
};

type SongRow = {
  id: string;
  album_id: string | null;
  title: string | null;
  artwork_url?: string | null;
  cover_url?: string | null;
  audio_url?: string | null;
  url?: string | null;
  lyrics_url?: string | null;
  has_lyrics?: boolean | null;
  lyrics_type?: string | null;
};

type AlbumRow = {
  id: string;
  title: string | null;
  artwork_url?: string | null;
};

type SyncedLyricsRow = {
  id: string;
  song_id: string;
  lyrics_json: unknown;
  lyrics_lrc: string | null;
  plain_lyrics: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  version: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type TrackLyricsRow = {
  plain_lyrics: string | null;
  synced_lrc: string | null;
  lyrics_type: string | null;
  lyrics_url: string | null;
  word_sync_json: unknown | null;
  r2_lyrics_key: string | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function getTrack(trackId: string) {
  const { data, error } = await supabaseAdmin
    .from("songs")
    .select(
      "id, album_id, title, artwork_url, cover_url, audio_url, url, lyrics_url, has_lyrics, lyrics_type"
    )
    .eq("id", trackId)
    .maybeSingle();

  if (error) throw error;
  return data as SongRow | null;
}

async function getRelease(releaseId: string) {
  const { data, error } = await supabaseAdmin
    .from("albums")
    .select("id, title, artwork_url")
    .eq("id", releaseId)
    .maybeSingle();

  if (error) throw error;
  return data as AlbumRow | null;
}

async function getSyncedLyricsRow(trackId: string) {
  const { data, error } = await supabaseAdmin
    .from("synced_lyrics")
    .select("*")
    .eq("song_id", trackId)
    .maybeSingle();

  if (error) throw error;
  return data as SyncedLyricsRow | null;
}

async function getLegacyLyricsRow(trackId: string) {
  const { data, error } = await supabaseAdmin
    .from("track_lyrics")
    .select("plain_lyrics, synced_lrc, lyrics_type, lyrics_url, word_sync_json, r2_lyrics_key")
    .eq("song_id", trackId)
    .maybeSingle();

  if (error) throw error;
  return data as TrackLyricsRow | null;
}

function buildResponsePayload(
  row: SyncedLyricsRow | null,
  legacy: TrackLyricsRow | null
) {
  if (row) {
    const lyricsJson = sanitizeSyncedLyricsJson(row.lyrics_json);

    return {
      id: row.id,
      songId: row.song_id,
      lyricsJson,
      lyricsLrc: row.lyrics_lrc || "",
      plainLyrics: row.plain_lyrics || "",
      version: row.version || 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      source: "synced_lyrics" as const,
    };
  }

  const legacyLrc = String(legacy?.synced_lrc || "").trim();
  const legacyPlain = String(legacy?.plain_lyrics || "").trim();
  const lyricsJson = legacyLrc ? parseLrcToSyncedLines(legacyLrc) : [];

  return {
    id: null,
    songId: null,
    lyricsJson,
    lyricsLrc: legacyLrc,
    plainLyrics: legacyPlain,
    version: 0,
    createdAt: null,
    updatedAt: null,
    source: legacyPlain || legacyLrc ? ("track_lyrics_fallback" as const) : ("empty" as const),
  };
}

async function mirrorLegacyTrackLyrics(
  trackId: string,
  track: SongRow,
  plainLyrics: string,
  lyricsLrc: string,
  existingLegacy: TrackLyricsRow | null
) {
  const hasLyrics = Boolean(plainLyrics.trim() || lyricsLrc.trim());
  const lyricsType = lyricsLrc.trim() ? "lrc" : plainLyrics.trim() ? "plain" : null;

  const legacyPayload = {
    song_id: trackId,
    lyrics_type: lyricsType,
    plain_lyrics: plainLyrics || null,
    synced_lrc: lyricsLrc || null,
    word_sync_json: existingLegacy?.word_sync_json || null,
    r2_lyrics_key: existingLegacy?.r2_lyrics_key || null,
    lyrics_url: existingLegacy?.lyrics_url || track.lyrics_url || null,
    source: "premium_synced_editor",
  };

  if (existingLegacy) {
    const { error } = await supabaseAdmin
      .from("track_lyrics")
      .update(legacyPayload)
      .eq("song_id", trackId);

    if (error) throw error;
  } else if (hasLyrics) {
    const { error } = await supabaseAdmin.from("track_lyrics").insert(legacyPayload);
    if (error) throw error;
  }

  const { error: updateSongError } = await supabaseAdmin
    .from("songs")
    .update({
      has_lyrics: hasLyrics,
      lyrics_type: lyricsType,
      lyrics_updated_at: new Date().toISOString(),
    })
    .eq("id", trackId);

  if (updateSongError) throw updateSongError;
}

function parseRequestBody(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return {
      lyricsJson: [] as SyncedLyricLine[],
      plainLyrics: "",
      lyricsLrc: "",
    };
  }

  const body = raw as Record<string, unknown>;
  const plainLyrics = String(body.plainLyrics ?? body.plain_lyrics ?? "").trim();
  const lyricsLrc = String(body.lyricsLrc ?? body.lyrics_lrc ?? "").trim();
  const lyricsJson = sanitizeSyncedLyricsJson(body.lyricsJson ?? body.lyrics_json);

  if (lyricsJson.length) {
    const payload = buildSyncedPayload(lyricsJson, plainLyrics);
    return {
      lyricsJson: payload.lyricsJson,
      plainLyrics: payload.plainLyrics,
      lyricsLrc: lyricsLrc || payload.lyricsLrc,
    };
  }

  if (lyricsLrc) {
    const parsed = parseLrcToSyncedLines(lyricsLrc);
    const payload = buildSyncedPayload(parsed, plainLyrics);
    return payload;
  }

  return {
    lyricsJson: [] as SyncedLyricLine[],
    plainLyrics,
    lyricsLrc,
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const { trackId } = await context.params;
    const track = await getTrack(trackId);

    if (!track) {
      return NextResponse.json(
        { success: false, error: "Track was not found." },
        { status: 404 }
      );
    }

    const [release, syncedRow, legacyRow] = await Promise.all([
      track.album_id ? getRelease(track.album_id) : Promise.resolve(null),
      getSyncedLyricsRow(trackId),
      getLegacyLyricsRow(trackId),
    ]);

    const artworkUrl =
      track.artwork_url || track.cover_url || release?.artwork_url || null;
    const audioUrl = String(track.audio_url || track.url || "").trim() || null;

    return NextResponse.json({
      success: true,
      release: release
        ? {
            id: release.id,
            title: release.title || "Untitled Release",
            artworkUrl: release.artwork_url || null,
          }
        : null,
      track: {
        id: track.id,
        releaseId: track.album_id,
        title: track.title || "Untitled Track",
        artworkUrl,
        audioUrl,
      },
      syncedLyrics: buildResponsePayload(syncedRow, legacyRow),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to load synced lyrics."),
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const { trackId } = await context.params;
    const track = await getTrack(trackId);

    if (!track) {
      return NextResponse.json(
        { success: false, error: "Track was not found." },
        { status: 404 }
      );
    }

    const existing = await getSyncedLyricsRow(trackId);

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: "Synced lyrics already exist for this track. Use PATCH to update.",
        },
        { status: 409 }
      );
    }

    const body = parseRequestBody(await request.json().catch(() => ({})));
    const legacyRow = await getLegacyLyricsRow(trackId);
    const now = new Date().toISOString();

    const insertPayload = {
      song_id: trackId,
      lyrics_json: body.lyricsJson,
      lyrics_lrc: body.lyricsLrc || null,
      plain_lyrics: body.plainLyrics || null,
      created_by_user_id: permission.user.id,
      updated_by_user_id: permission.user.id,
      version: 1,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabaseAdmin
      .from("synced_lyrics")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) throw error;

    await mirrorLegacyTrackLyrics(
      trackId,
      track,
      body.plainLyrics,
      body.lyricsLrc,
      legacyRow
    );

    return NextResponse.json({
      success: true,
      message: "Synced lyrics created.",
      syncedLyrics: buildResponsePayload(data as SyncedLyricsRow, legacyRow),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to create synced lyrics."),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const { trackId } = await context.params;
    const track = await getTrack(trackId);

    if (!track) {
      return NextResponse.json(
        { success: false, error: "Track was not found." },
        { status: 404 }
      );
    }

    const existing = await getSyncedLyricsRow(trackId);
    const legacyRow = await getLegacyLyricsRow(trackId);
    const body = parseRequestBody(await request.json().catch(() => ({})));
    const now = new Date().toISOString();
    const nextVersion = (existing?.version || 0) + 1;

    const upsertPayload = {
      song_id: trackId,
      lyrics_json: body.lyricsJson,
      lyrics_lrc: body.lyricsLrc || null,
      plain_lyrics: body.plainLyrics || null,
      updated_by_user_id: permission.user.id,
      version: nextVersion,
      updated_at: now,
      ...(existing
        ? {}
        : {
            created_by_user_id: permission.user.id,
            created_at: now,
          }),
    };

    const { data, error } = await supabaseAdmin
      .from("synced_lyrics")
      .upsert(upsertPayload, { onConflict: "song_id" })
      .select("*")
      .single();

    if (error) throw error;

    await mirrorLegacyTrackLyrics(
      trackId,
      track,
      body.plainLyrics,
      body.lyricsLrc,
      legacyRow
    );

    return NextResponse.json({
      success: true,
      message: "Synced lyrics saved.",
      syncedLyrics: buildResponsePayload(data as SyncedLyricsRow, legacyRow),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to save synced lyrics."),
      },
      { status: 500 }
    );
  }
}

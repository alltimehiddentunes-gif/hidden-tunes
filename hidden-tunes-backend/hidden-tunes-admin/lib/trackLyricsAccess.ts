import { NextResponse } from "next/server";

import {
  canEditAllTrackLyrics,
  canAccessCreatorLyricsEditors,
} from "@/lib/adminPermissions";
import type { UploadPermissionProfile } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type TrackLyricsSongRow = {
  id: string;
  album_id: string | null;
  title: string | null;
  uploaded_by_user_id: string | null;
  has_lyrics?: boolean | null;
  lyrics_type?: string | null;
};

export type TrackLyricsAlbumRow = {
  id: string;
  title: string | null;
  uploaded_by_user_id: string | null;
};

export type TrackLyricsAccessResult =
  | {
      allowed: true;
      song: TrackLyricsSongRow;
      album: TrackLyricsAlbumRow | null;
      reason:
        | "admin_override"
        | "song_owner"
        | "album_owner"
        | "artist_submission";
    }
  | {
      allowed: false;
      song: TrackLyricsSongRow | null;
      album: TrackLyricsAlbumRow | null;
      reason: "not_found" | "forbidden";
    };

function jsonForbidden(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

function jsonNotFound(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 404 });
}

export async function loadTrackForLyricsAccess(trackId: string) {
  const { data, error } = await supabaseAdmin
    .from("songs")
    .select("id, album_id, title, uploaded_by_user_id, has_lyrics, lyrics_type")
    .eq("id", trackId)
    .maybeSingle();

  if (error) throw error;
  return (data as TrackLyricsSongRow | null) ?? null;
}

export async function loadAlbumForLyricsAccess(albumId: string | null) {
  if (!albumId) return null;

  const { data, error } = await supabaseAdmin
    .from("albums")
    .select("id, title, uploaded_by_user_id")
    .eq("id", albumId)
    .maybeSingle();

  if (error) throw error;
  return (data as TrackLyricsAlbumRow | null) ?? null;
}

async function isArtistPublishedSong(userId: string, trackId: string) {
  const { data, error } = await supabaseAdmin
    .from("artist_submissions")
    .select("id")
    .eq("artist_user_id", userId)
    .eq("published_song_id", trackId)
    .limit(1);

  if (error) throw error;
  return Boolean(data?.length);
}

export async function evaluateTrackLyricsAccess(
  profile: UploadPermissionProfile,
  trackId: string,
  expectedReleaseId?: string | null
): Promise<TrackLyricsAccessResult> {
  const song = await loadTrackForLyricsAccess(trackId);

  if (!song) {
    return {
      allowed: false,
      song: null,
      album: null,
      reason: "not_found",
    };
  }

  if (expectedReleaseId && song.album_id && song.album_id !== expectedReleaseId) {
    return {
      allowed: false,
      song,
      album: null,
      reason: "not_found",
    };
  }

  const album = await loadAlbumForLyricsAccess(song.album_id);

  if (canEditAllTrackLyrics(profile.role)) {
    return {
      allowed: true,
      song,
      album,
      reason: "admin_override",
    };
  }

  const userId = profile.id;

  if (song.uploaded_by_user_id && song.uploaded_by_user_id === userId) {
    return {
      allowed: true,
      song,
      album,
      reason: "song_owner",
    };
  }

  if (album?.uploaded_by_user_id && album.uploaded_by_user_id === userId) {
    return {
      allowed: true,
      song,
      album,
      reason: "album_owner",
    };
  }

  if (await isArtistPublishedSong(userId, trackId)) {
    return {
      allowed: true,
      song,
      album,
      reason: "artist_submission",
    };
  }

  return {
    allowed: false,
    song,
    album,
    reason: "forbidden",
  };
}

export function trackLyricsAccessErrorResponse(result: TrackLyricsAccessResult) {
  if (result.reason === "not_found") {
    return jsonNotFound("Track was not found for this release.");
  }

  return jsonForbidden(
    "You do not have permission to edit lyrics for this track."
  );
}

export function assertCreatorLyricsRole(role?: string | null) {
  return canAccessCreatorLyricsEditors(role);
}

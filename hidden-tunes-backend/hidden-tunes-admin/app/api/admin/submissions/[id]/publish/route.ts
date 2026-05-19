import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { canManageUploaderOwnership } from "@/lib/adminPermissions";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  applyNormalizedGenreToSongInsert,
  normalizeIncomingGenrePayload,
} from "@/lib/uploadGenreTaxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type DuplicateMatch = {
  type: "audio_url" | "title_artist" | "source_artist_submission_id";
  table: "songs" | "albums";
  id: string | null;
  title: string | null;
  details: string | null;
};

type SubmissionRow = Record<string, string | number | boolean | null | undefined>;

const SUBMISSION_SELECT_FIELDS = [
  "id",
  "title",
  "artist_name",
  "description",
  "genre",
  "mood",
  "release_notes",
  "lyrics_text",
  "status",
  "audio_url",
  "artwork_url",
  "artist_user_id",
  "reviewed_by_user_id",
  "published_album_id",
  "published_song_id",
  "published_at",
  "publish_status",
].join(",");

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      success: false,
      error,
      details: details || null,
    },
    { status }
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getReviewReadiness(submission: SubmissionRow) {
  const missingRequirements: string[] = [];

  if (!String(submission.title || "").trim()) {
    missingRequirements.push("title");
  }

  if (!String(submission.artist_name || "").trim()) {
    missingRequirements.push("artist_name");
  }

  if (!String(submission.audio_url || "").trim()) {
    missingRequirements.push("audio");
  }

  if (!String(submission.artwork_url || "").trim()) {
    missingRequirements.push("artwork");
  }

  return {
    isReviewReady: missingRequirements.length === 0,
    missingRequirements,
  };
}

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  const message = String(error?.message || "").toLowerCase();

  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("source_artist_submission_id")
  );
}

async function requireAdminPublishPermission(request: NextRequest) {
  const permission = await requireUploadPermission(request);

  if (permission.errorResponse) {
    return permission;
  }

  if (!canManageUploaderOwnership(permission.profile.role)) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError(
        "Only owner and admin roles can publish artist submissions.",
        403
      ),
    };
  }

  return permission;
}

async function findAudioUrlDuplicates(audioUrl: string) {
  if (!audioUrl) return [] as DuplicateMatch[];

  const { data, error } = await supabaseAdmin
    .from("songs")
    .select("id,title,artist_name,album_title,audio_url")
    .eq("audio_url", audioUrl)
    .limit(10);

  if (error) throw error;

  return ((data || []) as unknown as SubmissionRow[]).map((match) => ({
    type: "audio_url" as const,
    table: "songs" as const,
    id: String(match.id || "") || null,
    title: String(match.title || "") || null,
    details: String(match.artist_name || match.album_title || "") || null,
  }));
}

async function findTitleArtistDuplicates(title: string, artistName: string) {
  if (!title || !artistName) return [] as DuplicateMatch[];

  const { data, error } = await supabaseAdmin
    .from("songs")
    .select("id,title,artist_name,album_title,audio_url")
    .eq("title", title)
    .eq("artist_name", artistName)
    .limit(10);

  if (error) throw error;

  return ((data || []) as unknown as SubmissionRow[]).map((match) => ({
    type: "title_artist" as const,
    table: "songs" as const,
    id: String(match.id || "") || null,
    title: String(match.title || "") || null,
    details: String(match.artist_name || match.album_title || "") || null,
  }));
}

async function findSourceSubmissionDuplicates(
  submissionId: string,
  warnings: string[]
) {
  const matches: DuplicateMatch[] = [];

  const { data: songMatches, error: songError } = await supabaseAdmin
    .from("songs")
    .select("id,title,source_artist_submission_id")
    .eq("source_artist_submission_id", submissionId)
    .limit(10);

  if (songError) {
    if (isMissingColumnError(songError)) {
      warnings.push(
        "Song traceability column is not available yet; source duplicate check skipped."
      );
    } else {
      throw songError;
    }
  } else {
    matches.push(
      ...((songMatches || []) as unknown as SubmissionRow[]).map((match) => ({
        type: "source_artist_submission_id" as const,
        table: "songs" as const,
        id: String(match.id || "") || null,
        title: String(match.title || "") || null,
        details: "Song already references this artist submission.",
      }))
    );
  }

  const { data: albumMatches, error: albumError } = await supabaseAdmin
    .from("albums")
    .select("id,title,source_artist_submission_id")
    .eq("source_artist_submission_id", submissionId)
    .limit(10);

  if (albumError) {
    if (isMissingColumnError(albumError)) {
      warnings.push(
        "Album traceability column is not available yet; source duplicate check skipped."
      );
    } else {
      throw albumError;
    }
  } else {
    matches.push(
      ...((albumMatches || []) as unknown as SubmissionRow[]).map((match) => ({
        type: "source_artist_submission_id" as const,
        table: "albums" as const,
        id: String(match.id || "") || null,
        title: String(match.title || "") || null,
        details: "Album already references this artist submission.",
      }))
    );
  }

  return matches;
}

async function runPreflight(submission: SubmissionRow) {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const duplicateMatches: DuplicateMatch[] = [];
  const readiness = getReviewReadiness(submission);
  const submissionId = String(submission.id || "").trim();
  const status = String(submission.status || "");
  const title = String(submission.title || "").trim();
  const artistName = String(submission.artist_name || "").trim();
  const audioUrl = String(submission.audio_url || "").trim();

  if (status !== "approved") {
    blockingReasons.push("Submission must be approved before publishing.");
  }

  if (!readiness.isReviewReady) {
    blockingReasons.push(
      `Submission is missing: ${readiness.missingRequirements.join(", ")}.`
    );
  }

  if (!audioUrl) {
    blockingReasons.push("Submission is missing an audio URL.");
  }

  if (!String(submission.artwork_url || "").trim()) {
    blockingReasons.push("Submission is missing an artwork URL.");
  }

  if (
    submission.published_album_id ||
    submission.published_song_id ||
    submission.published_at ||
    submission.publish_status === "published"
  ) {
    blockingReasons.push("Submission already has published catalog metadata.");
  }

  duplicateMatches.push(...(await findAudioUrlDuplicates(audioUrl)));
  duplicateMatches.push(...(await findTitleArtistDuplicates(title, artistName)));
  duplicateMatches.push(
    ...(await findSourceSubmissionDuplicates(submissionId, warnings))
  );

  if (duplicateMatches.length > 0) {
    blockingReasons.push("Potential catalog duplicates were found.");
  }

  return {
    canPublish: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    duplicateMatches,
  };
}

async function getOrCreateArtist({
  name,
  slug,
  artworkUrl,
}: {
  name: string;
  slug: string;
  artworkUrl: string;
}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("artists")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing as SubmissionRow;

  const { data, error } = await supabaseAdmin
    .from("artists")
    .insert({
      name,
      slug,
      image_url: artworkUrl,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as SubmissionRow;
}

async function rollbackCreatedCatalogRows({
  songId,
  albumId,
}: {
  songId?: string | null;
  albumId?: string | null;
}) {
  if (songId) {
    await supabaseAdmin.from("track_lyrics").delete().eq("song_id", songId);
    await supabaseAdmin.from("songs").delete().eq("id", songId);
  }

  if (albumId) {
    const { count } = await supabaseAdmin
      .from("songs")
      .select("id", { count: "exact", head: true })
      .eq("album_id", albumId);

    if (!count) {
      await supabaseAdmin.from("albums").delete().eq("id", albumId);
    }
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  let createdAlbumId: string | null = null;
  let createdSongId: string | null = null;

  try {
    const permission = await requireAdminPublishPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const { id } = await context.params;
    const submissionId = String(id || "").trim();

    if (!submissionId) {
      return jsonError("Missing submission id.", 400);
    }

    const { data: submission, error: submissionError } = await supabaseAdmin
      .from("artist_submissions")
      .select(SUBMISSION_SELECT_FIELDS)
      .eq("id", submissionId)
      .maybeSingle();

    if (submissionError) {
      return jsonError(
        "Failed to load artist submission for publishing.",
        500,
        submissionError.message
      );
    }

    if (!submission) {
      return jsonError("Artist submission not found.", 404);
    }

    const submissionRow = submission as unknown as SubmissionRow;
    const preflight = await runPreflight(submissionRow);

    if (!preflight.canPublish) {
      return NextResponse.json(
        {
          success: false,
          error: "Submission cannot be published until preflight blockers are cleared.",
          blocking_reasons: preflight.blockingReasons,
          warnings: preflight.warnings,
          duplicate_matches: preflight.duplicateMatches,
        },
        { status: 409 }
      );
    }

    const title = String(submissionRow.title || "").trim();
    const artistName = String(submissionRow.artist_name || "").trim();
    const artistSlug = slugify(artistName) || "unknown-artist";
    const titleSlug = slugify(title) || "untitled-song";
    const albumTitle = title;
    const albumSlug = titleSlug || "artist-submission";
    const artworkUrl = String(submissionRow.artwork_url || "").trim();
    const audioUrl = String(submissionRow.audio_url || "").trim();
    const lyricsText = String(submissionRow.lyrics_text || "").trim();

    const artist = await getOrCreateArtist({
      name: artistName,
      slug: artistSlug,
      artworkUrl,
    });
    const artistId = String(artist.id || "");

    const { data: album, error: albumError } = await supabaseAdmin
      .from("albums")
      .insert({
        title: albumTitle,
        slug: albumSlug,
        artist_id: artistId,
        artwork_url: artworkUrl,
        uploaded_by_user_id: permission.user.id,
        review_status: "approved",
        source_artist_submission_id: submissionId,
      })
      .select("*")
      .single();

    if (albumError) throw albumError;

    createdAlbumId = String(album.id || "");
    const songId = randomUUID();
    createdSongId = songId;

    const normalizedGenre = normalizeIncomingGenrePayload({
      genre: submissionRow.genre,
    });

    const { data: song, error: songError } = await supabaseAdmin
      .from("songs")
      .insert(
        applyNormalizedGenreToSongInsert(
          {
            id: songId,
            title,
            slug: `${artistSlug}-${titleSlug}-${songId.slice(0, 8)}`,
            artist_id: artistId,
            album_id: createdAlbumId,
            uploaded_by_user_id: permission.user.id,
            artist: artistName,
            album: albumTitle,
            artist_name: artistName,
            album_title: albumTitle,
            mood: String(submissionRow.mood || "").trim() || null,
            duration: 0,
            duration_seconds: 0,
            audio_url: audioUrl,
            url: audioUrl,
            cover_url: artworkUrl,
            artwork_url: artworkUrl,
            lyrics_url: null,
            has_lyrics: Boolean(lyricsText),
            lyrics_type: lyricsText ? "plain" : null,
            lyrics_updated_at: lyricsText ? new Date().toISOString() : null,
            source_name: "Hidden Tunes",
            source_type: "r2",
            type: "r2",
            is_online: true,
            isOnline: true,
            review_status: "approved",
            source_artist_submission_id: submissionId,
          },
          normalizedGenre
        )
      )
      .select("*")
      .single();

    if (songError) {
      await rollbackCreatedCatalogRows({ albumId: createdAlbumId });
      createdAlbumId = null;
      createdSongId = null;
      throw songError;
    }

    let warning: string | null = null;

    if (lyricsText) {
      const { error: lyricsError } = await supabaseAdmin
        .from("track_lyrics")
        .insert({
          song_id: song.id,
          lyrics_type: "plain",
          plain_lyrics: lyricsText,
          synced_lrc: null,
          word_sync_json: null,
          r2_lyrics_key: null,
          lyrics_url: null,
          source: "artist_submission",
        });

      if (lyricsError) {
        warning =
          "Catalog release was published, but lyrics could not be inserted. The song is preserved.";
      }
    }

    const publishedAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("artist_submissions")
      .update({
        published_album_id: createdAlbumId,
        published_song_id: song.id,
        published_at: publishedAt,
        published_by_user_id: permission.profile.id,
        publish_status: "published",
        publish_error: null,
      })
      .eq("id", submissionId);

    if (updateError) {
      await rollbackCreatedCatalogRows({
        songId: createdSongId,
        albumId: createdAlbumId,
      });
      return jsonError(
        "Catalog rows were rolled back because submission publish metadata could not be saved.",
        500,
        updateError.message
      );
    }

    const { error: eventError } = await supabaseAdmin
      .from("artist_submission_events")
      .insert({
        submission_id: submissionId,
        actor_user_id: permission.profile.id,
        actor_role: permission.profile.role,
        event_type: "published_to_catalog",
        previous_status: "approved",
        new_status: "published",
        note: `Published to catalog album ${createdAlbumId} and song ${song.id}.`,
      });

    if (eventError) {
      warning = warning
        ? `${warning} Audit event could not be recorded.`
        : "Catalog release was published, but audit event could not be recorded.";
    }

    return NextResponse.json({
      success: true,
      warning,
      published: {
        album_id: createdAlbumId,
        song_id: song.id,
        published_at: publishedAt,
      },
    });
  } catch (error) {
    return jsonError(
      "Unexpected artist submission publish error.",
      500,
      getErrorMessage(error, String(error))
    );
  }
}

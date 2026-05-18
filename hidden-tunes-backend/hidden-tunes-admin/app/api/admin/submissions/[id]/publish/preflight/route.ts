import { NextRequest, NextResponse } from "next/server";

import { canManageUploaderOwnership } from "@/lib/adminPermissions";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  "status",
  "audio_url",
  "artwork_url",
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

async function requireAdminPublishPreflightPermission(request: NextRequest) {
  const permission = await requireUploadPermission(request);

  if (permission.errorResponse) {
    return permission;
  }

  if (!canManageUploaderOwnership(permission.profile.role)) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError(
        "Only owner and admin roles can run publish preflight checks.",
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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const permission = await requireAdminPublishPreflightPermission(request);

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
        "Failed to load artist submission for preflight.",
        500,
        submissionError.message
      );
    }

    if (!submission) {
      return jsonError("Artist submission not found.", 404);
    }

    const submissionRow = submission as unknown as SubmissionRow;
    const blockingReasons: string[] = [];
    const warnings: string[] = [];
    const duplicateMatches: DuplicateMatch[] = [];
    const readiness = getReviewReadiness(submissionRow);
    const status = String(submissionRow.status || "");
    const title = String(submissionRow.title || "").trim();
    const artistName = String(submissionRow.artist_name || "").trim();
    const audioUrl = String(submissionRow.audio_url || "").trim();

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

    if (!String(submissionRow.artwork_url || "").trim()) {
      blockingReasons.push("Submission is missing an artwork URL.");
    }

    if (
      submissionRow.published_album_id ||
      submissionRow.published_song_id ||
      submissionRow.published_at ||
      submissionRow.publish_status === "published"
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

    return NextResponse.json({
      success: true,
      can_publish: blockingReasons.length === 0,
      blocking_reasons: blockingReasons,
      warnings,
      duplicate_matches: duplicateMatches,
      submission: {
        id: submissionRow.id,
        title,
        artist_name: artistName,
        status,
        is_review_ready: readiness.isReviewReady,
        missing_requirements: readiness.missingRequirements,
        publish_status: submissionRow.publish_status || "not_published",
        published_album_id: submissionRow.published_album_id || null,
        published_song_id: submissionRow.published_song_id || null,
      },
    });
  } catch (error) {
    return jsonError(
      "Unexpected publish preflight error.",
      500,
      getErrorMessage(error, String(error))
    );
  }
}

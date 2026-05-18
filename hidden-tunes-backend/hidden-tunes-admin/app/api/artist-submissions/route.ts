import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

import { getSupabaseAdmin, getSupabaseAdminConfig } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ArtistSubmissionProfile = {
  id: string;
  email: string | null;
  role: string | null;
  status: string | null;
};

type SubmissionBody = {
  id?: unknown;
  title?: unknown;
  artist_name?: unknown;
  artistName?: unknown;
  description?: unknown;
  genre?: unknown;
  mood?: unknown;
  release_notes?: unknown;
  releaseNotes?: unknown;
  lyrics_text?: unknown;
  lyricsText?: unknown;
  resubmit?: unknown;
};

const ARTIST_SUBMISSION_ROLES = new Set(["artist", "creator"]);
const ARTIST_EDITABLE_STATUSES = new Set(["draft", "needs_changes"]);
const MAX_TITLE_LENGTH = 140;
const MAX_ARTIST_NAME_LENGTH = 140;
const MAX_SHORT_METADATA_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1200;
const MAX_RELEASE_NOTES_LENGTH = 2000;
const MAX_LYRICS_LENGTH = 12000;
const SUBMISSION_SELECT_FIELDS = [
  "id",
  "artist_user_id",
  "title",
  "artist_name",
  "description",
  "genre",
  "mood",
  "release_notes",
  "lyrics_text",
  "audio_url",
  "audio_filename",
  "audio_size_bytes",
  "audio_mime_type",
  "artwork_url",
  "artwork_filename",
  "artwork_size_bytes",
  "artwork_mime_type",
  "status",
  "admin_notes",
  "submitted_at",
  "reviewed_at",
  "reviewed_by_user_id",
  "created_at",
  "updated_at",
].join(",");

function getSupabaseAuthConfig() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

  const missingVariables = [
    !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL" : null,
    !supabaseAnonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
  ].filter(Boolean) as string[];

  return {
    supabaseUrl,
    supabaseAnonKey,
    missingVariables,
  };
}

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

function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function readSubmissionDetails(body: SubmissionBody) {
  return {
    description: cleanOptionalText(body.description, MAX_DESCRIPTION_LENGTH),
    genre: cleanOptionalText(body.genre, MAX_SHORT_METADATA_LENGTH),
    mood: cleanOptionalText(body.mood, MAX_SHORT_METADATA_LENGTH),
    release_notes: cleanOptionalText(
      body.release_notes || body.releaseNotes,
      MAX_RELEASE_NOTES_LENGTH
    ),
    lyrics_text: cleanOptionalText(
      body.lyrics_text || body.lyricsText,
      MAX_LYRICS_LENGTH
    ),
  };
}

function getReviewReadiness(submission: Record<string, unknown>) {
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
    is_review_ready: missingRequirements.length === 0,
    missing_requirements: missingRequirements,
  };
}

function withReviewReadiness<T extends Record<string, unknown>>(submission: T) {
  return {
    ...submission,
    ...getReviewReadiness(submission),
  };
}

async function requireArtistSubmissionPermission(
  request: NextRequest
): Promise<
  | {
      user: User;
      profile: ArtistSubmissionProfile;
      errorResponse: null;
    }
  | {
      user: null;
      profile: null;
      errorResponse: NextResponse;
    }
> {
  const adminConfig = getSupabaseAdminConfig();

  if (adminConfig.missingVariables.length > 0) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError(
        "Missing Supabase admin environment variables.",
        500,
        adminConfig.missingVariables
      ),
    };
  }

  const authConfig = getSupabaseAuthConfig();

  if (authConfig.missingVariables.length > 0) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError(
        "Missing Supabase auth environment variables.",
        500,
        authConfig.missingVariables
      ),
    };
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError(
        "Artist submission requires a signed-in account token.",
        401
      ),
    };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const supabase = createClient(
    authConfig.supabaseUrl,
    authConfig.supabaseAnonKey
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError(
        "Invalid or expired artist session.",
        401,
        authError?.message || null
      ),
    };
  }

  const { data: profile, error: profileError } = await getSupabaseAdmin()
    .from("uploader_profiles")
    .select("id, email, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError(
        "Artist profile not found for this account.",
        403,
        profileError?.message || null
      ),
    };
  }

  if (profile.status !== "active") {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError("Artist account is not active.", 403),
    };
  }

  if (!ARTIST_SUBMISSION_ROLES.has(String(profile.role || ""))) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError(
        "This account is not allowed to create artist submissions.",
        403
      ),
    };
  }

  return {
    user,
    profile: profile as ArtistSubmissionProfile,
    errorResponse: null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const permission = await requireArtistSubmissionPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const { data, error } = await getSupabaseAdmin()
      .from("artist_submissions")
      .select(SUBMISSION_SELECT_FIELDS)
      .eq("artist_user_id", permission.profile.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return jsonError(
        "Failed to load artist submissions.",
        500,
        error.message
      );
    }

    return NextResponse.json({
      success: true,
      submissions: ((data || []) as unknown as Array<Record<string, unknown>>).map(
        withReviewReadiness
      ),
    });
  } catch (error) {
    return jsonError(
      "Unexpected artist submissions API error.",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const permission = await requireArtistSubmissionPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const body = (await request.json().catch(() => ({}))) as SubmissionBody;
    const title = cleanString(body.title, MAX_TITLE_LENGTH);
    const artistName = cleanString(
      body.artist_name || body.artistName,
      MAX_ARTIST_NAME_LENGTH
    );
    const details = readSubmissionDetails(body);

    if (!title) {
      return jsonError("Submission title is required.", 400);
    }

    if (!artistName) {
      return jsonError("Artist name is required.", 400);
    }

    const now = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from("artist_submissions")
      .insert({
        artist_user_id: permission.profile.id,
        title,
        artist_name: artistName,
        ...details,
        status: "pending_review",
        submitted_at: now,
      })
      .select(SUBMISSION_SELECT_FIELDS)
      .single();

    if (error) {
      return jsonError(
        "Failed to create artist submission.",
        500,
        error.message
      );
    }

    return NextResponse.json(
      {
        success: true,
        submission: withReviewReadiness(data as unknown as Record<string, unknown>),
      },
      { status: 201 }
    );
  } catch (error) {
    return jsonError(
      "Unexpected artist submission API error.",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const permission = await requireArtistSubmissionPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const body = (await request.json().catch(() => ({}))) as SubmissionBody;
    const id = cleanString(body.id, 80);
    const title = cleanString(body.title, MAX_TITLE_LENGTH);
    const artistName = cleanString(
      body.artist_name || body.artistName,
      MAX_ARTIST_NAME_LENGTH
    );
    const details = readSubmissionDetails(body);
    const shouldResubmit = body.resubmit === true;

    if (!id) {
      return jsonError("Submission id is required.", 400);
    }

    if (!title) {
      return jsonError("Submission title is required.", 400);
    }

    if (!artistName) {
      return jsonError("Artist name is required.", 400);
    }

    const { data: existingSubmission, error: loadError } =
      await getSupabaseAdmin()
        .from("artist_submissions")
        .select("id, status")
        .eq("id", id)
        .eq("artist_user_id", permission.profile.id)
        .maybeSingle();

    if (loadError) {
      return jsonError("Failed to load artist submission.", 500, loadError.message);
    }

    if (!existingSubmission) {
      return jsonError("Submission not found for this artist account.", 404);
    }

    if (!ARTIST_EDITABLE_STATUSES.has(String(existingSubmission.status || ""))) {
      return jsonError(
        "Only draft or needs changes submissions can be edited by artists.",
        403
      );
    }

    const updatePayload: Record<string, string> = {
      title,
      artist_name: artistName,
    };
    const optionalDetailsPayload: Record<string, string | null> = details;

    if (shouldResubmit) {
      updatePayload.status = "pending_review";
      updatePayload.submitted_at = new Date().toISOString();
    }

    const { data, error } = await getSupabaseAdmin()
      .from("artist_submissions")
      .update({
        ...updatePayload,
        ...optionalDetailsPayload,
      })
      .eq("id", id)
      .eq("artist_user_id", permission.profile.id)
      .select(SUBMISSION_SELECT_FIELDS)
      .single();

    if (error) {
      return jsonError(
        "Failed to update artist submission.",
        500,
        error.message
      );
    }

    return NextResponse.json({
      success: true,
      submission: withReviewReadiness(data as unknown as Record<string, unknown>),
    });
  } catch (error) {
    return jsonError(
      "Unexpected artist submission update error.",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}

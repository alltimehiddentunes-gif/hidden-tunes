import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

import { uploadToR2 } from "@/lib/r2";
import { getSupabaseAdmin, getSupabaseAdminConfig } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ArtistSubmissionProfile = {
  id: string;
  email: string | null;
  role: string | null;
  status: string | null;
};

const ARTIST_SUBMISSION_ROLES = new Set(["artist", "creator"]);
const ATTACHABLE_STATUSES = new Set(["draft", "needs_changes"]);
const MAX_AUDIO_BYTES = 120 * 1024 * 1024;

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

function cleanFileName(fileName: string) {
  const safeName = String(fileName || "artist-submission-audio")
    .trim()
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);

  return safeName || "artist-submission-audio";
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
        "Artist submission audio requires a signed-in account token.",
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
        "This account is not allowed to attach artist submission audio.",
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

export async function POST(request: NextRequest) {
  try {
    const permission = await requireArtistSubmissionPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const formData = await request.formData();
    const submissionId = String(formData.get("submissionId") || "").trim();
    const file = formData.get("file");

    if (!submissionId) {
      return jsonError("Submission id is required.", 400);
    }

    if (!(file instanceof File)) {
      return jsonError("Missing audio file.", 400);
    }

    if (file.size > MAX_AUDIO_BYTES) {
      return jsonError("Audio file is too large for draft attachment.", 413);
    }

    if (file.type && !file.type.startsWith("audio/")) {
      return jsonError("Only audio files can be attached.", 400);
    }

    const { data: existingSubmission, error: loadError } =
      await getSupabaseAdmin()
        .from("artist_submissions")
        .select("id, status")
        .eq("id", submissionId)
        .eq("artist_user_id", permission.profile.id)
        .maybeSingle();

    if (loadError) {
      return jsonError("Failed to load artist submission.", 500, loadError.message);
    }

    if (!existingSubmission) {
      return jsonError("Submission not found for this artist account.", 404);
    }

    if (!ATTACHABLE_STATUSES.has(String(existingSubmission.status || ""))) {
      return jsonError(
        "Audio can only be attached to draft or needs changes submissions.",
        403
      );
    }

    const fileName = cleanFileName(file.name);
    const key = `artist-submissions/${permission.profile.id}/${submissionId}/${Date.now()}-${fileName}`;
    const body = Buffer.from(await file.arrayBuffer());
    const publicUrl = await uploadToR2({
      key,
      body,
      contentType: file.type || "application/octet-stream",
    });

    const { data, error } = await getSupabaseAdmin()
      .from("artist_submissions")
      .update({
        audio_url: publicUrl,
        audio_filename: fileName,
        audio_size_bytes: file.size,
        audio_mime_type: file.type || "application/octet-stream",
      })
      .eq("id", submissionId)
      .eq("artist_user_id", permission.profile.id)
      .select(SUBMISSION_SELECT_FIELDS)
      .single();

    if (error) {
      return jsonError(
        "Audio uploaded, but submission metadata could not be updated.",
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
      "Unexpected artist submission audio error.",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}

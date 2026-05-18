import { NextRequest, NextResponse } from "next/server";

import { canManageUploaderOwnership } from "@/lib/adminPermissions";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdateSubmissionBody = {
  id?: unknown;
  status?: unknown;
  admin_notes?: unknown;
  adminNotes?: unknown;
};

type SubmissionEventRow = {
  id: string;
  submission_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  note: string | null;
  created_at: string | null;
};

const REVIEW_STATUSES = new Set([
  "pending_review",
  "needs_changes",
  "approved",
  "rejected",
]);
const LIST_STATUSES = new Set(["draft", ...REVIEW_STATUSES]);

const SUBMISSION_SELECT_FIELDS = [
  "id",
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
  "created_at",
  "updated_at",
  "artist_user_id",
  "reviewed_by_user_id",
].join(",");

const EVENT_SELECT_FIELDS = [
  "id",
  "submission_id",
  "actor_user_id",
  "actor_role",
  "event_type",
  "previous_status",
  "new_status",
  "note",
  "created_at",
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

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function normalizeNullableText(value: unknown) {
  const cleaned = cleanText(value, 4000);
  return cleaned || null;
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

async function attachSubmissionEvents(
  submissions: Array<Record<string, unknown>>
) {
  const submissionIds = submissions
    .map((submission) => String(submission.id || ""))
    .filter(Boolean);

  if (submissionIds.length === 0) {
    return submissions.map((submission) => ({
      ...submission,
      events: [] as SubmissionEventRow[],
    })).map(withReviewReadiness);
  }

  const { data, error } = await supabaseAdmin
    .from("artist_submission_events")
    .select(EVENT_SELECT_FIELDS)
    .in("submission_id", submissionIds)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw error;
  }

  const eventsBySubmission = new Map<string, SubmissionEventRow[]>();
  ((data || []) as unknown as SubmissionEventRow[]).forEach((event) => {
    const submissionId = String(event.submission_id || "");
    if (!submissionId) return;

    eventsBySubmission.set(submissionId, [
      ...(eventsBySubmission.get(submissionId) || []),
      event,
    ]);
  });

  return submissions
    .map((submission) => ({
      ...submission,
      events: eventsBySubmission.get(String(submission.id || "")) || [],
    }))
    .map(withReviewReadiness);
}

function getReviewEventType(statusChanged: boolean, notesChanged: boolean) {
  if (statusChanged && notesChanged) return "status_and_notes_changed";
  if (statusChanged) return "status_changed";
  return "admin_notes_changed";
}

async function requireAdminSubmissionReviewPermission(request: NextRequest) {
  const permission = await requireUploadPermission(request);

  if (permission.errorResponse) {
    return permission;
  }

  if (!canManageUploaderOwnership(permission.profile.role)) {
    return {
      user: null,
      profile: null,
      errorResponse: jsonError(
        "Only owner and admin roles can review artist submissions.",
        403
      ),
    };
  }

  return permission;
}

export async function GET(request: NextRequest) {
  try {
    const permission = await requireAdminSubmissionReviewPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const status = request.nextUrl.searchParams.get("status");
    const cleanStatus =
      status && status !== "all" && LIST_STATUSES.has(status) ? status : null;

    let query = supabaseAdmin
      .from("artist_submissions")
      .select(SUBMISSION_SELECT_FIELDS)
      .order("created_at", { ascending: false })
      .limit(200);

    if (cleanStatus) {
      query = query.eq("status", cleanStatus);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError("Failed to load artist submissions.", 500, error.message);
    }

    const submissionsWithEvents = await attachSubmissionEvents(
      (data || []) as unknown as Array<Record<string, unknown>>
    );

    return NextResponse.json({
      success: true,
      submissions: submissionsWithEvents,
    });
  } catch (error) {
    return jsonError(
      "Unexpected admin submissions API error.",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const permission = await requireAdminSubmissionReviewPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const body = (await request.json().catch(() => ({}))) as UpdateSubmissionBody;
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 40);
    const adminNotes = normalizeNullableText(body.admin_notes || body.adminNotes);

    if (!id) {
      return jsonError("Submission id is required.", 400);
    }

    if (!status || !REVIEW_STATUSES.has(status)) {
      return jsonError("A valid review status is required.", 400);
    }

    const { data: existingSubmission, error: existingError } = await supabaseAdmin
      .from("artist_submissions")
      .select("id, status, admin_notes")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return jsonError(
        "Failed to load artist submission.",
        500,
        existingError.message
      );
    }

    if (!existingSubmission) {
      return jsonError("Artist submission not found.", 404);
    }

    const previousStatus = String(existingSubmission.status || "");
    const previousNotes = normalizeNullableText(existingSubmission.admin_notes);
    const statusChanged = previousStatus !== status;
    const notesChanged = previousNotes !== adminNotes;

    const { data, error } = await supabaseAdmin
      .from("artist_submissions")
      .update({
        status,
        admin_notes: adminNotes,
        reviewed_at: new Date().toISOString(),
        reviewed_by_user_id: permission.profile.id,
      })
      .eq("id", id)
      .select(SUBMISSION_SELECT_FIELDS)
      .single();

    if (error) {
      return jsonError(
        "Failed to update artist submission.",
        500,
        error.message
      );
    }

    if (statusChanged || notesChanged) {
      const { error: eventError } = await supabaseAdmin
        .from("artist_submission_events")
        .insert({
          submission_id: id,
          actor_user_id: permission.profile.id,
          actor_role: permission.profile.role,
          event_type: getReviewEventType(statusChanged, notesChanged),
          previous_status: previousStatus || null,
          new_status: status,
          note: adminNotes,
        });

      if (eventError) {
        return jsonError(
          "Submission updated, but audit event could not be recorded.",
          500,
          eventError.message
        );
      }
    }

    const submissionsWithEvents = await attachSubmissionEvents([
      data as unknown as Record<string, unknown>,
    ]);

    return NextResponse.json({
      success: true,
      submission: submissionsWithEvents[0] || data,
    });
  } catch (error) {
    return jsonError(
      "Unexpected admin submission update error.",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}

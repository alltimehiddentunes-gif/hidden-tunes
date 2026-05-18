"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { canManageUploaderOwnership } from "@/lib/adminPermissions";
import { getActiveUploaderSession, supabase } from "@/lib/auth";

type SubmissionStatus =
  | "draft"
  | "pending_review"
  | "needs_changes"
  | "approved"
  | "rejected";

type StatusFilter = "all" | SubmissionStatus;

type ArtistSubmission = {
  id: string;
  title: string;
  artist_name: string;
  description: string | null;
  genre: string | null;
  mood: string | null;
  release_notes: string | null;
  lyrics_text: string | null;
  audio_url: string | null;
  audio_filename: string | null;
  audio_size_bytes: number | null;
  audio_mime_type: string | null;
  artwork_url: string | null;
  artwork_filename: string | null;
  artwork_size_bytes: number | null;
  artwork_mime_type: string | null;
  status: SubmissionStatus | string;
  is_review_ready: boolean;
  missing_requirements: string[];
  admin_notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  artist_user_id: string | null;
  reviewed_by_user_id: string | null;
  events?: ArtistSubmissionEvent[];
};

type ArtistSubmissionEvent = {
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

type SubmissionsResponse = {
  success: boolean;
  submissions?: ArtistSubmission[];
  error?: string;
};

type UpdateSubmissionResponse = {
  success: boolean;
  submission?: ArtistSubmission;
  error?: string;
};

type PublishPreflightDuplicateMatch = {
  type: string;
  table: string;
  id: string | null;
  title: string | null;
  details: string | null;
};

type PublishPreflightResponse = {
  success: boolean;
  can_publish?: boolean;
  blocking_reasons?: string[];
  warnings?: string[];
  duplicate_matches?: PublishPreflightDuplicateMatch[];
  error?: string;
};

type SubmissionStatusOption = {
  value: StatusFilter;
  label: string;
  description: string;
  tone: string;
};

const SUBMISSION_STATUSES: SubmissionStatusOption[] = [
  {
    value: "all",
    label: "All",
    description: "Every artist submission in the review workspace.",
    tone: "border-white/10 bg-white/[0.055] text-white/64",
  },
  {
    value: "draft",
    label: "Drafts",
    description: "Artists prepare title, credits, assets, and submission details.",
    tone: "border-white/10 bg-white/[0.055] text-white/64",
  },
  {
    value: "pending_review",
    label: "Pending Review",
    description: "Submitted items waiting for admin or owner review.",
    tone: "border-yellow-300/25 bg-yellow-300/10 text-yellow-100",
  },
  {
    value: "needs_changes",
    label: "Needs Changes",
    description: "Review feedback has been sent back before resubmission.",
    tone: "border-cyan-300/20 bg-cyan-400/10 text-cyan-100",
  },
  {
    value: "approved",
    label: "Approved",
    description: "Admin-approved submissions ready for a future publish workflow.",
    tone: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
  },
  {
    value: "rejected",
    label: "Rejected",
    description: "Declined submissions remain separate from the live catalog.",
    tone: "border-red-300/20 bg-red-500/10 text-red-100",
  },
];

const REVIEW_ACTIONS: Array<{
  status: Exclude<SubmissionStatus, "draft">;
  label: string;
  tone: string;
}> = [
  {
    status: "needs_changes",
    label: "Needs Changes",
    tone: "border-cyan-300/25 text-cyan-100 hover:bg-cyan-400/10",
  },
  {
    status: "approved",
    label: "Approve",
    tone: "border-emerald-300/25 text-emerald-100 hover:bg-emerald-400/10",
  },
  {
    status: "rejected",
    label: "Reject",
    tone: "border-red-300/25 text-red-100 hover:bg-red-500/10",
  },
];

const REVIEW_REQUIREMENTS = [
  { key: "title", label: "Title" },
  { key: "artist_name", label: "Artist name" },
  { key: "audio", label: "Audio draft" },
  { key: "artwork", label: "Artwork draft" },
];

function formatDate(value: string | null) {
  if (!value) return "Not set";

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not set";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(time));
}

function formatFileSize(bytes: number | null) {
  if (!bytes || bytes < 1) return "Size unknown";
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) return `${megabytes.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function getMissingRequirementLabels(missingRequirements: string[]) {
  const missing = new Set(missingRequirements || []);
  return REVIEW_REQUIREMENTS.filter((requirement) =>
    missing.has(requirement.key)
  ).map((requirement) => requirement.label);
}

function statusLabel(value: string | null | undefined) {
  const match = SUBMISSION_STATUSES.find((status) => status.value === value);
  return match?.label || String(value || "Unknown").replace("_", " ");
}

function statusTone(value: string | null | undefined) {
  const match = SUBMISSION_STATUSES.find((status) => status.value === value);
  return match?.tone || "border-white/10 bg-white/[0.055] text-white/64";
}

function formatEventType(value: string | null | undefined) {
  return String(value || "review_updated").replace(/_/g, " ");
}

function hasReviewDetails(submission: ArtistSubmission) {
  return Boolean(
    submission.description ||
      submission.genre ||
      submission.mood ||
      submission.release_notes ||
      submission.lyrics_text
  );
}

export default function AdminSubmissionsPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<ArtistSubmission[]>([]);
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isChecking, setIsChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [checkingPreflightId, setCheckingPreflightId] = useState("");
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [preflightResults, setPreflightResults] = useState<
    Record<string, PublishPreflightResponse>
  >({});

  const summary = useMemo(
    () => ({
      total: submissions.length,
      pending: submissions.filter(
        (submission) => submission.status === "pending_review"
      ).length,
      publishing: "Disabled",
    }),
    [submissions]
  );

  async function getRequiredAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;

    if (!accessToken) {
      throw new Error("Your admin session expired. Sign in again.");
    }

    return accessToken;
  }

  const loadSubmissions = useCallback(async () => {
    const { profile } = await getActiveUploaderSession();

    if (!profile) {
      router.replace("/admin/login");
      return;
    }

    if (!canManageUploaderOwnership(profile.role)) {
      setPageError("Only owners and admins can review artist submissions.");
      setIsChecking(false);
      setIsLoading(false);
      return;
    }

    setIsChecking(false);
    setIsLoading(true);
    setPageError("");

    const accessToken = await getRequiredAccessToken();
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);

    const response = await fetch(`/api/admin/submissions?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const payload = (await response.json().catch(() => null)) as
      | SubmissionsResponse
      | null;

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || "Could not load artist submissions.");
    }

    const nextSubmissions = payload.submissions || [];
    setSubmissions(nextSubmissions);
    setNotesDrafts((current) => {
      const next: Record<string, string> = {};
      nextSubmissions.forEach((submission) => {
        next[submission.id] =
          current[submission.id] ?? submission.admin_notes ?? "";
      });
      return next;
    });
    setIsLoading(false);
  }, [router, statusFilter]);

  useEffect(() => {
    let ignore = false;

    async function boot() {
      try {
        await loadSubmissions();
      } catch (error) {
        if (!ignore) {
          setPageError(
            error instanceof Error
              ? error.message
              : "Artist submissions could not load."
          );
          setIsChecking(false);
          setIsLoading(false);
        }
      }
    }

    boot();

    return () => {
      ignore = true;
    };
  }, [loadSubmissions]);

  async function updateSubmissionStatus(
    submission: ArtistSubmission,
    status: Exclude<SubmissionStatus, "draft">
  ) {
    setUpdatingId(submission.id);
    setNotice("");
    setPageError("");

    try {
      const accessToken = await getRequiredAccessToken();
      const response = await fetch("/api/admin/submissions", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: submission.id,
          status,
          admin_notes: notesDrafts[submission.id] ?? "",
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | UpdateSubmissionResponse
        | null;

      if (!response.ok || !payload?.success || !payload.submission) {
        throw new Error(payload?.error || "Could not update submission.");
      }

      const updatedSubmission = payload.submission;

      setSubmissions((current) =>
        current.map((item) =>
          item.id === updatedSubmission.id ? updatedSubmission : item
        )
      );
      setNotesDrafts((current) => ({
        ...current,
        [updatedSubmission.id]: updatedSubmission.admin_notes || "",
      }));
      setNotice(
        `${updatedSubmission.title} marked ${statusLabel(
          updatedSubmission.status
        ).toLowerCase()}.`
      );
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Could not update submission."
      );
    } finally {
      setUpdatingId("");
    }
  }

  async function checkPublishPreflight(submission: ArtistSubmission) {
    setCheckingPreflightId(submission.id);
    setNotice("");
    setPageError("");

    try {
      const accessToken = await getRequiredAccessToken();
      const response = await fetch(
        `/api/admin/submissions/${submission.id}/publish/preflight`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | PublishPreflightResponse
        | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Publish preflight could not run.");
      }

      setPreflightResults((current) => ({
        ...current,
        [submission.id]: payload,
      }));
      setNotice(
        payload.can_publish
          ? `${submission.title} passed publish preflight. No catalog publish action has been added yet.`
          : `${submission.title} needs attention before future publishing.`
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Publish preflight could not run."
      );
    } finally {
      setCheckingPreflightId("");
    }
  }

  return (
    <AdminShell
      eyebrow="Artist Submissions"
      title="Review Queue"
      description="Foundation-only workspace for future artist submissions. Admin and owner accounts remain the final authority before anything can reach the live catalog."
      actions={
        <button
          onClick={() => router.push("/admin/releases")}
          className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black transition hover:-translate-y-0.5"
        >
          Releases
        </button>
      }
    >
      {isChecking ? (
        <section className="rounded-[1.7rem] border border-white/10 bg-[#101017]/92 p-5 text-sm font-bold text-white/50">
          Checking submission review access...
        </section>
      ) : pageError ? (
        <section className="rounded-[1.7rem] border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">
          {pageError}
        </section>
      ) : (
        <>
          <section className="mb-4 grid gap-3 sm:grid-cols-3">
            <Metric label="Loaded Submissions" value={String(summary.total)} />
            <Metric label="Pending Review" value={String(summary.pending)} />
            <Metric label="Publishing" value={summary.publishing} />
          </section>

          <section className="mb-4 rounded-[2rem] border border-white/10 bg-[#101017]/92 p-6 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
              Review Controls
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
              Submissions stay separate from releases.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/52">
              Approval here does not publish to the public catalog yet. These
              controls only update `artist_submissions.status`, admin notes,
              and review metadata for the artist-facing workflow.
            </p>
            <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-yellow-100/78">
              Approval still does not publish this submission to the catalog.
            </p>
          </section>

          <section className="mb-4 flex flex-wrap gap-2 rounded-[1.7rem] border border-white/10 bg-white/[0.035] p-3">
            {SUBMISSION_STATUSES.map((status) => (
              <button
                key={status.value}
                onClick={() => setStatusFilter(status.value)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  statusFilter === status.value
                    ? "border-yellow-300/35 bg-yellow-300/12 text-white"
                    : "border-white/10 bg-white/[0.04] text-white/58 hover:border-white/20 hover:text-white"
                }`}
              >
                <span className="block text-sm font-black">{status.label}</span>
                <span className="mt-1 block max-w-[220px] text-xs leading-5 text-white/42">
                  {status.description}
                </span>
              </button>
            ))}
          </section>

          {notice ? (
            <section className="mb-4 rounded-[1.4rem] border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-100">
              {notice}
            </section>
          ) : null}

          <section className="mt-4 rounded-[1.7rem] border border-yellow-300/15 bg-yellow-300/[0.06] p-5">
            <p className="text-sm font-bold leading-6 text-yellow-50/78">
              Approval here does not publish to the public catalog yet. No
              albums, songs, R2 assets, or upload-track flows are changed by this
              queue.
            </p>
          </section>

          <section className="mt-4 grid gap-3">
            {isLoading ? (
              <div className="rounded-[1.7rem] border border-white/10 bg-[#101017]/92 p-5 text-sm font-bold text-white/50">
                Loading artist submissions...
              </div>
            ) : submissions.length === 0 ? (
              <div className="rounded-[1.7rem] border border-white/10 bg-[#101017]/92 p-8 text-center">
                <p className="text-2xl font-black tracking-[-0.04em]">
                  No submissions found
                </p>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/45">
                  Artist-created submissions will appear here after mobile
                  creator accounts send releases for review.
                </p>
              </div>
            ) : (
              submissions.map((submission) => {
                const missingRequirementLabels = getMissingRequirementLabels(
                  submission.missing_requirements || []
                );
                const preflightResult = preflightResults[submission.id];

                return (
                  <article
                    key={submission.id}
                    className={`rounded-[1.8rem] border p-5 shadow-2xl ${
                      submission.is_review_ready
                        ? "border-white/10 bg-[#101017]/92"
                        : "border-yellow-300/25 bg-yellow-300/[0.045]"
                    }`}
                  >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${statusTone(
                            submission.status
                          )}`}
                        >
                          {statusLabel(submission.status)}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/42">
                          {formatDate(submission.submitted_at)}
                        </span>
                        <span
                          className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                            submission.is_review_ready
                              ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                              : "border-yellow-300/25 bg-yellow-300/10 text-yellow-100"
                          }`}
                        >
                          {submission.is_review_ready
                            ? "Review Ready"
                            : "Incomplete"}
                        </span>
                      </div>
                      <h3 className="mt-4 text-2xl font-black tracking-[-0.04em]">
                        {submission.title}
                      </h3>
                      <p className="mt-1 text-sm font-bold text-white/50">
                        {submission.artist_name}
                      </p>
                      <p className="mt-3 max-w-2xl break-all text-xs leading-5 text-white/35">
                        Artist user: {submission.artist_user_id || "Unknown"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-white/35">
                        Reviewed: {formatDate(submission.reviewed_at)}
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[420px]">
                      {REVIEW_ACTIONS.map((action) => {
                        const approvalBlocked =
                          action.status === "approved" &&
                          !submission.is_review_ready;
                        const isDisabled =
                          updatingId === submission.id || approvalBlocked;

                        return (
                          <div key={action.status}>
                            <button
                              onClick={() =>
                                updateSubmissionStatus(
                                  submission,
                                  action.status
                                )
                              }
                              disabled={isDisabled}
                              className={`w-full rounded-2xl border px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${action.tone}`}
                            >
                              {updatingId === submission.id
                                ? "Saving..."
                                : action.label}
                            </button>
                            {approvalBlocked ? (
                              <p className="mt-2 text-xs font-bold leading-5 text-yellow-100/72">
                                Add {missingRequirementLabels.join(", ")} before
                                approval.
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    className={`mt-5 rounded-3xl border p-4 ${
                      submission.is_review_ready
                        ? "border-emerald-300/20 bg-emerald-400/10"
                        : "border-yellow-300/20 bg-yellow-300/10"
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p
                          className={`text-xs font-black uppercase tracking-[0.18em] ${
                            submission.is_review_ready
                              ? "text-emerald-100"
                              : "text-yellow-100"
                          }`}
                        >
                          {submission.is_review_ready
                            ? "Ready For Review"
                            : "Missing Requirements"}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-white/58">
                          Readiness is computed from title, artist name, audio,
                          and artwork. Lyrics are optional for now.
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/52">
                        {REVIEW_REQUIREMENTS.length -
                          missingRequirementLabels.length}
                        /{REVIEW_REQUIREMENTS.length} complete
                      </span>
                    </div>

                    {missingRequirementLabels.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {missingRequirementLabels.map((requirement) => (
                          <span
                            key={requirement}
                            className="rounded-full border border-yellow-300/20 bg-black/20 px-3 py-1 text-xs font-bold text-yellow-100"
                          >
                            Missing {requirement}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm font-bold text-emerald-100/80">
                        Required review assets are present. This still does not
                        publish the submission.
                      </p>
                    )}
                  </div>

                  <div className="mt-5 rounded-3xl border border-purple-300/15 bg-purple-400/[0.055] p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-100">
                          Publish Preflight
                        </p>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/54">
                          Read-only check for a future publish workflow. This
                          does not create albums, songs, R2 assets, or public
                          catalog rows.
                        </p>
                      </div>
                      <button
                        onClick={() => checkPublishPreflight(submission)}
                        disabled={checkingPreflightId === submission.id}
                        className="rounded-2xl border border-purple-200/25 px-4 py-3 text-sm font-black text-purple-50 transition hover:bg-purple-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {checkingPreflightId === submission.id
                          ? "Checking..."
                          : "Check publish readiness"}
                      </button>
                    </div>

                    {preflightResult ? (
                      <div
                        className={`mt-4 rounded-2xl border p-4 ${
                          preflightResult.can_publish
                            ? "border-emerald-300/20 bg-emerald-400/10"
                            : "border-yellow-300/20 bg-black/20"
                        }`}
                      >
                        <p
                          className={`text-sm font-black ${
                            preflightResult.can_publish
                              ? "text-emerald-100"
                              : "text-yellow-100"
                          }`}
                        >
                          {preflightResult.can_publish
                            ? "Preflight passed for future publishing."
                            : "Preflight found blockers."}
                        </p>

                        {preflightResult.blocking_reasons?.length ? (
                          <div className="mt-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-yellow-100/75">
                              Blocking reasons
                            </p>
                            <div className="mt-2 grid gap-2">
                              {preflightResult.blocking_reasons.map((reason) => (
                                <p
                                  key={reason}
                                  className="rounded-xl border border-yellow-300/15 bg-yellow-300/10 px-3 py-2 text-xs font-bold leading-5 text-yellow-50/80"
                                >
                                  {reason}
                                </p>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {preflightResult.warnings?.length ? (
                          <div className="mt-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
                              Warnings
                            </p>
                            <div className="mt-2 grid gap-2">
                              {preflightResult.warnings.map((warning) => (
                                <p
                                  key={warning}
                                  className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-bold leading-5 text-white/56"
                                >
                                  {warning}
                                </p>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {preflightResult.duplicate_matches?.length ? (
                          <div className="mt-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-red-100/75">
                              Duplicate matches
                            </p>
                            <div className="mt-2 grid gap-2">
                              {preflightResult.duplicate_matches.map(
                                (match, index) => (
                                  <div
                                    key={`${match.table}-${match.id}-${index}`}
                                    className="rounded-xl border border-red-300/15 bg-red-500/10 px-3 py-2"
                                  >
                                    <p className="text-xs font-black text-red-50">
                                      {match.table} / {match.type}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-red-50/64">
                                      {match.title || "Untitled match"}{" "}
                                      {match.id ? `(${match.id})` : ""}
                                    </p>
                                    {match.details ? (
                                      <p className="mt-1 text-xs leading-5 text-red-50/45">
                                        {match.details}
                                      </p>
                                    ) : null}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        ) : null}

                        {!preflightResult.blocking_reasons?.length &&
                        !preflightResult.warnings?.length &&
                        !preflightResult.duplicate_matches?.length ? (
                          <p className="mt-3 text-xs font-bold leading-5 text-emerald-100/75">
                            No blockers, warnings, or duplicate matches were
                            found. Publishing remains disabled until a later
                            phase.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {hasReviewDetails(submission) ? (
                    <div className="mt-5 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
                      <div className="rounded-3xl border border-white/10 bg-black/24 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-300">
                          Submission Details
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {submission.genre ? (
                            <span className="rounded-full border border-yellow-300/20 bg-yellow-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-yellow-100">
                              {submission.genre}
                            </span>
                          ) : null}
                          {submission.mood ? (
                            <span className="rounded-full border border-purple-300/20 bg-purple-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-purple-100">
                              {submission.mood}
                            </span>
                          ) : null}
                        </div>

                        {submission.description ? (
                          <div className="mt-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/35">
                              Description
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/62">
                              {submission.description}
                            </p>
                          </div>
                        ) : null}

                        {submission.release_notes ? (
                          <div className="mt-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/35">
                              Release Notes
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/62">
                              {submission.release_notes}
                            </p>
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-black/24 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-300">
                          Lyrics Text
                        </p>
                        {submission.lyrics_text ? (
                          <p className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/62">
                            {submission.lyrics_text}
                          </p>
                        ) : (
                          <p className="mt-4 text-sm leading-6 text-white/35">
                            No lyrics text provided yet.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
                      <p className="text-sm font-bold leading-6 text-white/42">
                        No expanded metadata has been added yet. Review can
                        still proceed from the basic title and artist details.
                      </p>
                    </div>
                  )}

                  <div className="mt-5 rounded-3xl border border-yellow-300/15 bg-yellow-300/[0.055] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-300">
                      Audio Draft Attachment
                    </p>
                    {submission.audio_url ? (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                        <p className="text-sm font-black text-white">
                          {submission.audio_filename || "Attached audio"}
                        </p>
                        <p className="mt-1 text-xs font-bold text-white/45">
                          {formatFileSize(submission.audio_size_bytes)} /{" "}
                          {submission.audio_mime_type || "audio"}
                        </p>
                        <audio
                          controls
                          preload="metadata"
                          className="mt-4 w-full"
                        >
                          <source
                            src={submission.audio_url}
                            type={submission.audio_mime_type || undefined}
                          />
                          Your browser does not support the audio preview.
                        </audio>
                        <p className="mt-3 break-all text-xs leading-5 text-white/32">
                          {submission.audio_url}
                        </p>
                        <p className="mt-3 text-xs font-bold leading-5 text-yellow-50/70">
                          Review preview only — this audio is not published.
                        </p>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm leading-6 text-white/42">
                        No audio draft has been attached to this submission yet.
                      </p>
                    )}
                  </div>

                  <div className="mt-5 rounded-3xl border border-sky-300/15 bg-sky-400/[0.055] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-200">
                      Artwork Draft Attachment
                    </p>
                    {submission.artwork_url ? (
                      <div className="mt-4 grid gap-4 rounded-2xl border border-white/10 bg-black/25 p-4 md:grid-cols-[180px_1fr]">
                        <div
                          role="img"
                          aria-label={
                            submission.artwork_filename ||
                            "Artist submission artwork preview"
                          }
                          className="aspect-square w-full rounded-2xl border border-white/10 bg-cover bg-center"
                          style={{
                            backgroundImage: `url("${submission.artwork_url}")`,
                          }}
                        />
                        <div>
                          <p className="text-sm font-black text-white">
                            {submission.artwork_filename || "Attached artwork"}
                          </p>
                          <p className="mt-1 text-xs font-bold text-white/45">
                            {formatFileSize(submission.artwork_size_bytes)} /{" "}
                            {submission.artwork_mime_type || "image"}
                          </p>
                          <p className="mt-3 break-all text-xs leading-5 text-white/32">
                            {submission.artwork_url}
                          </p>
                          <p className="mt-3 text-xs font-bold leading-5 text-sky-50/75">
                            Review only — this artwork is not published to songs,
                            albums, or the public catalog.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm leading-6 text-white/42">
                        No artwork draft has been attached to this submission yet.
                      </p>
                    )}
                  </div>

                  <label className="mt-5 block">
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-white/38">
                      Admin notes
                    </span>
                    <textarea
                      value={notesDrafts[submission.id] ?? ""}
                      onChange={(event) =>
                        setNotesDrafts((current) => ({
                          ...current,
                          [submission.id]: event.target.value,
                        }))
                      }
                      placeholder="Add review feedback for the artist. Notes are saved when you choose a status action."
                      className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/28 focus:border-yellow-300/35"
                    />
                  </label>

                  <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-300">
                          Review History
                        </p>
                        <p className="mt-1 text-xs leading-5 text-white/38">
                          Read-only audit trail for admin review changes.
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/42">
                        {submission.events?.length || 0} events
                      </span>
                    </div>

                    {submission.events?.length ? (
                      <div className="mt-4 grid gap-3">
                        {submission.events.map((event) => (
                          <div
                            key={event.id}
                            className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm font-black capitalize text-white/82">
                                  {formatEventType(event.event_type)}
                                </p>
                                <p className="mt-1 text-xs text-white/38">
                                  {formatDate(event.created_at)} by{" "}
                                  {event.actor_role || "reviewer"}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {event.previous_status ? (
                                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/45">
                                    {statusLabel(event.previous_status)}
                                  </span>
                                ) : null}
                                {event.new_status ? (
                                  <span
                                    className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusTone(
                                      event.new_status
                                    )}`}
                                  >
                                    {statusLabel(event.new_status)}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {event.note ? (
                              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/58">
                                {event.note}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-white/42">
                        No review history has been recorded for this submission
                        yet.
                      </p>
                    )}
                  </div>
                  </article>
                );
              })
            )}
          </section>
        </>
      )}
    </AdminShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4">
      <p className="text-3xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/38">
        {label}
      </p>
    </div>
  );
}

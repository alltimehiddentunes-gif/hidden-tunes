import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const LECTURE_EXPANSION_TARGET = 200_000;
export const LECTURE_EXPANSION_MAX_PAGE_SIZE = 40;

export type LectureSourceState =
  | "approved"
  | "pending_legal_review"
  | "rejected"
  | "disabled";

export type LectureWorkerOptions = {
  dryRun?: boolean;
  source?: string;
  job?: string;
  batchSize?: number;
  maxPrograms?: number;
  maxPages?: number;
  maxRuntimeMinutes?: number;
  concurrency?: number;
  resume?: boolean;
  validateMedia?: boolean;
  publishValid?: boolean;
};

export type LectureExpansionStatus = {
  generated_at: string;
  target_programs: number;
  public_verified_playable_programs: number;
  imported_programs: number;
  imported_lessons: number;
  pending_programs: number;
  validation_queue: number;
  failed_validations: number;
  active_jobs: number;
  queued_jobs: number;
  paused_jobs: number;
  recent_errors: number;
};

export type LectureSourceConnector = {
  sourceKey: string;
  discoverPage(input: {
    cursor?: string | null;
    page?: number;
    limit: number;
    signal: AbortSignal;
  }): Promise<{
    cursor?: string | null;
    hasMore: boolean;
    programs: Array<Record<string, unknown>>;
  }>;
  fetchProgram(
    sourceProgramId: string,
    signal: AbortSignal
  ): Promise<Record<string, unknown>>;
  normalizeProgram(raw: Record<string, unknown>): Promise<Record<string, unknown>>;
  validateRights(program: Record<string, unknown>): Promise<{
    accepted: boolean;
    state: LectureSourceState;
    reason?: string;
  }>;
};

function asCount(value: number | null) {
  return typeof value === "number" ? value : 0;
}

async function countRows(
  table: string,
  apply?: (query: ReturnType<typeof supabaseAdmin.from> extends infer T ? T : never) => unknown
) {
  let query: any = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count, error } = await query;
  if (error) throw error;
  return asCount(count);
}

export async function getLectureExpansionStatus(): Promise<LectureExpansionStatus> {
  const [
    publicVerifiedPlayable,
    importedPrograms,
    importedLessons,
    pendingPrograms,
    validationQueue,
    failedValidations,
    activeJobs,
    queuedJobs,
    pausedJobs,
    recentErrors,
  ] = await Promise.all([
    countRows("lecture_items", (query: any) =>
      query
        .eq("status", "approved")
        .eq("is_active", true)
        .eq("is_public", true)
        .eq("is_verified", true)
        .eq("playback_status", "playable")
        .eq("playable_status", "playable")
        .eq("is_mature", false)
    ),
    countRows("lecture_items"),
    countRows("lecture_files"),
    countRows("lecture_items", (query: any) =>
      query.or("status.eq.pending,is_public.eq.false,is_verified.eq.false")
    ),
    countRows("lecture_media_validations", (query: any) =>
      query.in("status", ["queued", "retry_wait", "running"])
    ),
    countRows("lecture_media_validations", (query: any) =>
      query.in("status", ["failed", "quarantined"])
    ),
    countRows("lecture_import_jobs", (query: any) => query.eq("status", "running")),
    countRows("lecture_import_jobs", (query: any) =>
      query.in("status", ["queued", "retry_wait"])
    ),
    countRows("lecture_import_jobs", (query: any) => query.eq("status", "paused")),
    countRows("lecture_import_errors"),
  ]);

  return {
    generated_at: new Date().toISOString(),
    target_programs: LECTURE_EXPANSION_TARGET,
    public_verified_playable_programs: publicVerifiedPlayable,
    imported_programs: importedPrograms,
    imported_lessons: importedLessons,
    pending_programs: pendingPrograms,
    validation_queue: validationQueue,
    failed_validations: failedValidations,
    active_jobs: activeJobs,
    queued_jobs: queuedJobs,
    paused_jobs: pausedJobs,
    recent_errors: recentErrors,
  };
}

export function normalizeLectureWorkerOptions(
  options: LectureWorkerOptions
): Required<Pick<
  LectureWorkerOptions,
  "batchSize" | "maxPrograms" | "maxPages" | "maxRuntimeMinutes" | "concurrency"
>> &
  LectureWorkerOptions {
  return {
    ...options,
    batchSize: Math.max(1, Math.min(250, Number(options.batchSize ?? 100))),
    maxPrograms: Math.max(1, Math.min(10_000, Number(options.maxPrograms ?? 100))),
    maxPages: Math.max(1, Math.min(100, Number(options.maxPages ?? 1))),
    maxRuntimeMinutes: Math.max(1, Math.min(45, Number(options.maxRuntimeMinutes ?? 20))),
    concurrency: Math.max(1, Math.min(5, Number(options.concurrency ?? 3))),
  };
}

export async function claimLectureImportJob(workerId = `lecture-worker-${randomUUID()}`) {
  const { data, error } = await supabaseAdmin.rpc("claim_lecture_import_job", {
    worker_id: workerId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : null;
}

export async function runLectureImportWorker(options: LectureWorkerOptions = {}) {
  const normalized = normalizeLectureWorkerOptions(options);
  const statusBefore = await getLectureExpansionStatus();

  if (statusBefore.public_verified_playable_programs >= LECTURE_EXPANSION_TARGET) {
    return {
      success: true,
      dry_run: normalized.dryRun === true,
      target_reached: true,
      status_before: statusBefore,
      claimed_job: null,
      action: "target reached; discovery not started",
    };
  }

  if (normalized.dryRun) {
    return {
      success: true,
      dry_run: true,
      target_reached: false,
      status_before: statusBefore,
      claimed_job: null,
      options: normalized,
      action: "dry-run only; no jobs claimed and no rows changed",
    };
  }

  const job = await claimLectureImportJob();
  if (!job) {
    return {
      success: true,
      dry_run: false,
      target_reached: false,
      status_before: statusBefore,
      claimed_job: null,
      action: "no queued lecture import job available",
    };
  }

  return {
    success: true,
    dry_run: false,
    target_reached: false,
    status_before: statusBefore,
    claimed_job: {
      id: job.id,
      job_key: job.job_key,
      status: job.status,
      batch_size: job.batch_size,
      target_program_count: job.target_program_count,
    },
    options: normalized,
    action:
      "job claimed; connector execution intentionally disabled until Stage A source review is approved",
  };
}

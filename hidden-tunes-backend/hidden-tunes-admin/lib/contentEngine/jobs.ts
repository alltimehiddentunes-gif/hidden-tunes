import {
  CONTENT_ENGINE_TYPES,
  CONTENT_JOB_STATUSES,
  CONTENT_JOB_TYPES,
  type ContentEngineType,
  type ContentJobRow,
  type ContentJobStatus,
  type ContentJobType,
  isContentEngineType,
  isContentJobStatus,
  isContentJobType,
} from "@/lib/contentEngine/types";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanText, isAllowedValue } from "@/lib/tvCatalog";

export const CONTENT_JOB_SELECT =
  "id, content_type, job_type, status, priority, attempts, max_attempts, scheduled_at, started_at, completed_at, error_message, payload, result, created_at, updated_at";

export type EnqueueContentJobInput = {
  contentType: ContentEngineType;
  jobType: ContentJobType;
  payload?: Record<string, unknown>;
  priority?: number;
  scheduledAt?: string | Date;
  maxAttempts?: number;
};

export type ListContentJobsOptions = {
  status?: ContentJobStatus | null;
  contentType?: ContentEngineType | null;
  jobType?: ContentJobType | null;
  limit?: number;
};

function normalizePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeScheduledAt(value?: string | Date) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const text = cleanText(value, 40);
  if (!text) return new Date().toISOString();

  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    throw new Error("Invalid scheduledAt value.");
  }

  return new Date(parsed).toISOString();
}

function normalizePriority(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 100;
  return Math.floor(parsed);
}

function normalizeMaxAttempts(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 3;
  return Math.min(10, Math.floor(parsed));
}

export function toContentJobRow(row: Record<string, unknown>): ContentJobRow {
  return {
    id: String(row.id || ""),
    content_type: isContentEngineType(row.content_type)
      ? row.content_type
      : "podcast",
    job_type: isContentJobType(row.job_type) ? row.job_type : "ingest",
    status: isContentJobStatus(row.status) ? row.status : "pending",
    priority: Number.isFinite(Number(row.priority))
      ? Math.max(0, Number(row.priority))
      : 100,
    attempts: Number.isFinite(Number(row.attempts))
      ? Math.max(0, Number(row.attempts))
      : 0,
    max_attempts: Number.isFinite(Number(row.max_attempts))
      ? Math.max(1, Number(row.max_attempts))
      : 3,
    scheduled_at: String(row.scheduled_at || ""),
    started_at: cleanText(row.started_at, 40),
    completed_at: cleanText(row.completed_at, 40),
    error_message: cleanText(row.error_message, 2000),
    payload: normalizePayload(row.payload),
    result: normalizePayload(row.result),
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

export function validateEnqueueContentJobInput(input: EnqueueContentJobInput) {
  if (!isContentEngineType(input.contentType)) {
    throw new Error("Invalid contentType.");
  }

  if (!isContentJobType(input.jobType)) {
    throw new Error("Invalid jobType.");
  }

  return {
    content_type: input.contentType,
    job_type: input.jobType,
    payload: normalizePayload(input.payload),
    priority: normalizePriority(input.priority),
    scheduled_at: normalizeScheduledAt(input.scheduledAt),
    max_attempts: normalizeMaxAttempts(input.maxAttempts),
    status: "pending" as const,
  };
}

export async function enqueueContentJob(input: EnqueueContentJobInput) {
  const payload = validateEnqueueContentJobInput(input);

  const { data, error } = await supabaseAdmin
    .from("content_jobs")
    .insert(payload)
    .select(CONTENT_JOB_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return toContentJobRow(data as Record<string, unknown>);
}

export async function claimNextContentJob() {
  const now = new Date().toISOString();

  const { data: candidates, error: candidateError } = await supabaseAdmin
    .from("content_jobs")
    .select(CONTENT_JOB_SELECT)
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .order("priority", { ascending: true })
    .order("scheduled_at", { ascending: true })
    .limit(1);

  if (candidateError) {
    throw new Error(candidateError.message);
  }

  const candidate = (candidates || [])[0] as Record<string, unknown> | undefined;
  if (!candidate) return null;

  const currentAttempts = Number.isFinite(Number(candidate.attempts))
    ? Number(candidate.attempts)
    : 0;

  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("content_jobs")
    .update({
      status: "running",
      attempts: currentAttempts + 1,
      started_at: now,
    })
    .eq("id", String(candidate.id))
    .eq("status", "pending")
    .select(CONTENT_JOB_SELECT)
    .maybeSingle();

  if (claimError) {
    throw new Error(claimError.message);
  }

  if (!claimed) return null;

  return toContentJobRow(claimed as Record<string, unknown>);
}

export async function completeContentJob(
  jobId: string,
  result: Record<string, unknown> = {}
) {
  const id = cleanText(jobId, 80);
  if (!id) throw new Error("Job id is required.");

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("content_jobs")
    .update({
      status: "completed",
      completed_at: now,
      error_message: null,
      result: normalizePayload(result),
    })
    .eq("id", id)
    .eq("status", "running")
    .select(CONTENT_JOB_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Running content job not found.");
  }

  return toContentJobRow(data as Record<string, unknown>);
}

export async function failContentJob(
  jobId: string,
  errorMessage: string,
  result: Record<string, unknown> = {}
) {
  const id = cleanText(jobId, 80);
  if (!id) throw new Error("Job id is required.");

  const message = cleanText(errorMessage, 2000) || "Content job failed.";
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("content_jobs")
    .update({
      status: "failed",
      completed_at: now,
      error_message: message,
      result: normalizePayload(result),
    })
    .eq("id", id)
    .eq("status", "running")
    .select(CONTENT_JOB_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Running content job not found.");
  }

  return toContentJobRow(data as Record<string, unknown>);
}

export async function listContentJobs(options: ListContentJobsOptions = {}) {
  const limit = Math.min(
    100,
    Math.max(1, Number(options.limit) > 0 ? Math.floor(Number(options.limit)) : 50)
  );

  let query = supabaseAdmin
    .from("content_jobs")
    .select(CONTENT_JOB_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.status && isAllowedValue(options.status, CONTENT_JOB_STATUSES)) {
    query = query.eq("status", options.status);
  }

  if (
    options.contentType &&
    isAllowedValue(options.contentType, CONTENT_ENGINE_TYPES)
  ) {
    query = query.eq("content_type", options.contentType);
  }

  if (options.jobType && isAllowedValue(options.jobType, CONTENT_JOB_TYPES)) {
    query = query.eq("job_type", options.jobType);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as Record<string, unknown>[]).map((row) =>
    toContentJobRow(row)
  );
}

export function parseEnqueueContentJobBody(
  body: Record<string, unknown>
): EnqueueContentJobInput {
  const contentType = cleanText(body.content_type ?? body.contentType, 40);
  const jobType = cleanText(body.job_type ?? body.jobType, 40);

  if (!contentType || !isContentEngineType(contentType)) {
    throw new Error("Invalid content_type.");
  }

  if (!jobType || !isContentJobType(jobType)) {
    throw new Error("Invalid job_type.");
  }

  const input: EnqueueContentJobInput = {
    contentType,
    jobType,
    payload: normalizePayload(body.payload),
  };

  if (body.priority !== undefined && body.priority !== null) {
    input.priority = normalizePriority(body.priority);
  }

  const scheduledAt = body.scheduled_at ?? body.scheduledAt;
  if (scheduledAt !== undefined && scheduledAt !== null) {
    input.scheduledAt =
      scheduledAt instanceof Date ? scheduledAt : String(scheduledAt);
  }

  const maxAttempts = body.max_attempts ?? body.maxAttempts;
  if (maxAttempts !== undefined && maxAttempts !== null) {
    input.maxAttempts = normalizeMaxAttempts(maxAttempts);
  }

  return input;
}

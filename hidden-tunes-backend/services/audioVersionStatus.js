export const AUDIO_VERSION_STATUSES = [
  "pending",
  "processing",
  "ready",
  "failed",
  "skipped",
];

const TERMINAL_AUDIO_VERSION_STATUSES = new Set(["ready", "failed", "skipped"]);

const ALLOWED_AUDIO_VERSION_TRANSITIONS = {
  pending: new Set(["processing", "skipped"]),
  processing: new Set(["ready", "failed", "skipped"]),
  ready: new Set(["processing"]),
  failed: new Set(["processing", "pending"]),
  skipped: new Set(["processing", "pending"]),
};

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Normalize songs.audio_version_status to a known state or null.
 */
export function normalizeAudioVersionStatus(value) {
  const status = asTrimmedString(value).toLowerCase();
  return AUDIO_VERSION_STATUSES.includes(status) ? status : null;
}

/**
 * Terminal states do not require further work unless force-retry is requested.
 */
export function isAudioVersionTerminalState(status) {
  const normalized = normalizeAudioVersionStatus(status);
  return normalized ? TERMINAL_AUDIO_VERSION_STATUSES.has(normalized) : false;
}

/**
 * Validate whether a status transition is allowed by the state machine.
 */
export function canTransitionAudioVersionStatus(fromStatus, toStatus) {
  const from = normalizeAudioVersionStatus(fromStatus);
  const to = normalizeAudioVersionStatus(toStatus);

  if (!to) return false;
  if (!from) return to === "pending" || to === "processing" || to === "skipped";

  const allowed = ALLOWED_AUDIO_VERSION_TRANSITIONS[from];
  return Boolean(allowed?.has(to));
}

/**
 * Decide whether a generation request should proceed, noop, or reject.
 */
export function evaluateAudioVersionGenerationLock({
  status = null,
  force = false,
} = {}) {
  const normalized = normalizeAudioVersionStatus(status);

  if (normalized === "processing") {
    return {
      allowed: false,
      action: "reject",
      reason: "already_processing",
      message: "Audio version generation is already in progress for this song.",
      status: normalized,
    };
  }

  if (normalized === "ready" && !force) {
    return {
      allowed: false,
      action: "noop",
      reason: "already_ready",
      message: "Audio versions are already ready for this song.",
      status: normalized,
    };
  }

  if (normalized === "ready" && force) {
    return {
      allowed: true,
      action: "proceed",
      reason: "force_regenerate",
      message: "Forced regeneration requested for a ready song.",
      status: normalized,
    };
  }

  if (normalized === "failed") {
    return {
      allowed: true,
      action: "proceed",
      reason: "retry_after_failure",
      message: "Retrying audio version generation after failure.",
      status: normalized,
    };
  }

  if (normalized === "skipped") {
    return {
      allowed: true,
      action: "proceed",
      reason: "retry_after_skip",
      message: "Retrying audio version generation after skip.",
      status: normalized,
    };
  }

  return {
    allowed: true,
    action: "proceed",
    reason: normalized === "pending" ? "start_from_pending" : "start_initial",
    message: "Audio version generation can start.",
    status: normalized,
  };
}

/**
 * Build API/admin visibility fields from a songs row.
 */
export function buildAudioVersionStatusResponse(row) {
  if (!row || typeof row !== "object") return {};

  const hasStatusColumns =
    Object.prototype.hasOwnProperty.call(row, "audio_version_status") ||
    Object.prototype.hasOwnProperty.call(row, "audio_version_generated_at") ||
    Object.prototype.hasOwnProperty.call(row, "audio_version_error");

  if (!hasStatusColumns) return {};

  const error = asTrimmedString(row.audio_version_error);

  return {
    audio_version_status: normalizeAudioVersionStatus(row.audio_version_status),
    audio_version_generated_at: row.audio_version_generated_at || null,
    ...(error ? { audio_version_error: error } : { audio_version_error: null }),
  };
}

/**
 * Detect Supabase/Postgres errors caused by missing audio version status columns.
 */
export function isMissingAudioVersionStatusColumnError(error) {
  const message = String(error?.message || "").toLowerCase();

  return (
    error?.code === "42703" ||
    ((message.includes("audio_version_status") ||
      message.includes("audio_version_error") ||
      message.includes("audio_version_generated_at")) &&
      (message.includes("does not exist") ||
        message.includes("could not find") ||
        message.includes("column")))
  );
}

export function isMissingAudioVersionColumnError(error) {
  const message = String(error?.message || "").toLowerCase();

  return (
    isMissingAudioVersionStatusColumnError(error) ||
    (message.includes("audio_versions") &&
      (message.includes("does not exist") ||
        message.includes("could not find") ||
        message.includes("column")))
  );
}

export function stripAudioVersionFields(selectClause) {
  return selectClause
    .split("\n")
    .filter(
      (line) =>
        !line.includes("audio_versions") &&
        !line.includes("audio_version_status") &&
        !line.includes("audio_version_error") &&
        !line.includes("audio_version_generated_at")
    )
    .join("\n");
}

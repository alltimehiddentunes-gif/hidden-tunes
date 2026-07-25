/**
 * Canonical live-radio station switch transaction.
 *
 * Guarantees latest-intent wins:
 * - one active radio session generation
 * - one AbortController for outstanding network work
 * - one retry timer
 * - immediate silence of the previous station before resolve/load
 * - late async results from older generations are ignored
 */

import { radioStationSongId } from "../playback/radioPlaybackAdapter";

export type RadioSwitchOrigin =
  | "station_card"
  | "search"
  | "mini_player_next"
  | "full_player_next"
  | "previous"
  | "carplay_next"
  | "carplay_previous"
  | "lockscreen"
  | "remote"
  | "failure_fallback"
  | "retry"
  | "history"
  | "favorites"
  | "app"
  | "auto"
  | "android_auto";

export type RadioSwitchSession = {
  generation: number;
  stationId: string;
  mediaKey: string;
  origin: RadioSwitchOrigin;
  signal: AbortSignal;
  startedAt: number;
};

export type RadioRetryFailureClass =
  | "intentional_abort"
  | "transient_timeout"
  | "network_unavailable"
  | "relay_failure"
  | "unsupported_stream"
  | "permanent_station_failure";

/** Max automatic failure-skip attempts within one skip cycle. */
export const RADIO_MAX_FAILURE_SKIPS = 12;

/** Max reconnect attempts for the same station URL before giving up. */
export const RADIO_MAX_STREAM_RETRY_ATTEMPTS = 3;

/** Bounded exponential backoff base (ms). */
export const RADIO_RETRY_BACKOFF_BASE_MS = 700;

/** Cap backoff so retries cannot spin hot. */
export const RADIO_RETRY_BACKOFF_MAX_MS = 8_000;

/**
 * Exact-duplicate remote command window.
 * Short enough that intentional rapid skips still advance; long enough to
 * drop CarPlay/lock-screen double-fires of the same command.
 */
export const RADIO_REMOTE_COMMAND_COALESCE_MS = 90;

type RadioStopSilencer = (reason: string) => void | Promise<void>;

let radioSessionGeneration = 0;
let activeAbort: AbortController | null = null;
let activeSession: RadioSwitchSession | null = null;
let stopSilencer: RadioStopSilencer | null = null;
let activePlayerOwnerGeneration: number | null = null;
let activeRadioPlayerCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let retryGeneration: number | null = null;
let lastRemoteCommand = { command: "", at: 0 };
let lastPublishedMetadataKey = "";
let lastPublishedMetadataGeneration = 0;
let listenerRegistrationCount = 0;

function normalizeStationId(stationId: string) {
  const raw = String(stationId || "").trim();
  if (!raw) return "";
  return raw.startsWith("radio-") ? raw.slice("radio-".length) : raw;
}

export function logRadioSwitchDiagnostic(
  event: string,
  payload: Record<string, unknown> = {}
) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log("[RadioSwitch]", event, {
    sessionGeneration: radioSessionGeneration,
    stationId: activeSession?.stationId || null,
    origin: activeSession?.origin || null,
    activePlayerCount: activeRadioPlayerCount,
    ...payload,
    ts: Date.now(),
  });
}

export function isRadioSwitchAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = String((error as { name?: string }).name || "");
  if (name === "AbortError") return true;
  const message = String((error as { message?: string }).message || "");
  return (
    message === "Aborted" ||
    message === "radio_switch_aborted" ||
    /aborted|AbortError|stale/i.test(message)
  );
}

export function classifyRadioPlaybackFailure(error: unknown): RadioRetryFailureClass {
  if (isRadioSwitchAbortError(error)) return "intentional_abort";
  const message = String((error as Error)?.message || error || "").toLowerCase();
  if (!message) return "transient_timeout";
  if (message.includes("timeout") || message.includes("timed out")) {
    return "transient_timeout";
  }
  if (
    message.includes("network") ||
    message.includes("offline") ||
    message.includes("unreachable")
  ) {
    return "network_unavailable";
  }
  if (message.includes("relay")) return "relay_failure";
  if (
    message.includes("unsupported") ||
    message.includes("codec") ||
    message.includes("format")
  ) {
    return "unsupported_stream";
  }
  if (
    message.includes("404") ||
    message.includes("410") ||
    message.includes("gone") ||
    message.includes("permanent")
  ) {
    return "permanent_station_failure";
  }
  return "transient_timeout";
}

export function registerRadioStopSilencer(silencer: RadioStopSilencer | null) {
  stopSilencer = silencer;
  if (silencer) {
    listenerRegistrationCount += 1;
    logRadioSwitchDiagnostic("listener_registered", {
      kind: "stop_silencer",
      listenerRegistrationCount,
    });
  } else {
    listenerRegistrationCount = Math.max(0, listenerRegistrationCount - 1);
    logRadioSwitchDiagnostic("listener_removed", {
      kind: "stop_silencer",
      listenerRegistrationCount,
    });
  }
  return () => {
    if (stopSilencer === silencer) {
      stopSilencer = null;
      listenerRegistrationCount = Math.max(0, listenerRegistrationCount - 1);
      logRadioSwitchDiagnostic("listener_removed", {
        kind: "stop_silencer",
        listenerRegistrationCount,
      });
    }
  };
}

export function getRadioSessionGeneration() {
  return radioSessionGeneration;
}

export function getActiveRadioSwitchSession() {
  return activeSession;
}

export function isRadioSessionCurrent(generation: number) {
  return (
    generation === radioSessionGeneration &&
    Boolean(activeAbort) &&
    !activeAbort!.signal.aborted
  );
}

export function getActiveRadioSwitchAbortSignal() {
  return activeAbort?.signal ?? null;
}

export function cancelRadioRetry(reason = "cancelled") {
  if (!retryTimer && retryGeneration == null) return;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const cancelledGeneration = retryGeneration;
  retryGeneration = null;
  logRadioSwitchDiagnostic("retry_cancelled", {
    reason,
    cancelledGeneration,
    attempt: retryAttempt,
  });
}

function abortActiveController(reason: string) {
  const previous = activeAbort;
  activeAbort = null;
  if (!previous) return;
  try {
    previous.abort();
  } catch {
    // Ignore abort failures.
  }
  logRadioSwitchDiagnostic("radio_request_aborted", { reason });
}

/**
 * Synchronously invalidate the previous radio session and open a new generation.
 * Does not await silence — call `awaitRadioPreviousStopped` when ready.
 */
export function beginRadioStationSwitchSync(options: {
  stationId: string;
  origin: RadioSwitchOrigin;
  mediaKey?: string;
}): RadioSwitchSession {
  const stationId = normalizeStationId(options.stationId);
  const mediaKey =
    String(options.mediaKey || "").trim() || radioStationSongId(stationId);
  const previousGeneration = radioSessionGeneration;

  cancelRadioRetry("station_switch");
  abortActiveController("station_switch");

  radioSessionGeneration += 1;
  const generation = radioSessionGeneration;
  const controller = new AbortController();
  activeAbort = controller;

  const session: RadioSwitchSession = {
    generation,
    stationId,
    mediaKey,
    origin: options.origin,
    signal: controller.signal,
    startedAt: Date.now(),
  };
  activeSession = session;

  logRadioSwitchDiagnostic("radio_switch_requested", {
    stationId,
    mediaKey,
    origin: options.origin,
    generation,
    previousGeneration,
  });
  logRadioSwitchDiagnostic("previous_session_invalidated", {
    previousGeneration,
    generation,
  });

  // Fire-and-forget immediate silence — do not wait for URL resolve.
  if (stopSilencer) {
    void Promise.resolve()
      .then(() => stopSilencer?.("radio_station_switch"))
      .then(() => {
        logRadioSwitchDiagnostic("old_player_stopped", {
          generation,
          stationId,
          mode: "async",
        });
      })
      .catch((error) => {
        logRadioSwitchDiagnostic("old_player_stopped", {
          generation,
          stationId,
          mode: "async",
          error: String((error as Error)?.message || error),
        });
      });
  }

  return session;
}

export async function awaitRadioPreviousStopped(generation: number) {
  if (!isRadioSessionCurrent(generation)) {
    logRadioSwitchDiagnostic("stale_resolution_ignored", {
      generation,
      currentGeneration: radioSessionGeneration,
      phase: "await_stop",
    });
    return false;
  }
  if (!stopSilencer) return true;
  try {
    await stopSilencer("radio_station_switch");
    logRadioSwitchDiagnostic("old_player_stopped", {
      generation,
      mode: "awaited",
    });
  } catch (error) {
    logRadioSwitchDiagnostic("old_player_stopped", {
      generation,
      mode: "awaited",
      error: String((error as Error)?.message || error),
    });
  }
  return isRadioSessionCurrent(generation);
}

/**
 * Invalidate the previous radio session, cancel network/retry work, and
 * immediately silence the previous station. Does not wait for the new URL.
 */
export async function beginRadioStationSwitch(options: {
  stationId: string;
  origin: RadioSwitchOrigin;
  mediaKey?: string;
}): Promise<RadioSwitchSession> {
  const session = beginRadioStationSwitchSync(options);
  await awaitRadioPreviousStopped(session.generation);
  return session;
}

/**
 * Synchronously kill in-flight radio resolve/retry/load without starting a
 * replacement. Used at the top of next/previous so skip storms cancel work
 * before the serial queue transition runs.
 */
export function preemptRadioStationSwitch(reason = "preempt") {
  const previousGeneration = radioSessionGeneration;
  cancelRadioRetry(reason);
  abortActiveController(reason);
  radioSessionGeneration += 1;
  activeAbort = new AbortController();
  if (activePlayerOwnerGeneration != null) {
    releaseRadioPlayerOwner(activePlayerOwnerGeneration, reason);
  }
  logRadioSwitchDiagnostic("previous_session_invalidated", {
    reason,
    previousGeneration,
    generation: radioSessionGeneration,
  });
  return radioSessionGeneration;
}

/** Soft abort without starting a replacement (media-owner change / explicit stop). */
export function invalidateRadioStationSwitch(reason = "invalidate") {
  cancelRadioRetry(reason);
  abortActiveController(reason);
  if (activePlayerOwnerGeneration != null) {
    releaseRadioPlayerOwner(activePlayerOwnerGeneration, reason);
  }
  activeSession = null;
  logRadioSwitchDiagnostic("previous_session_invalidated", { reason });
}

export function claimRadioPlayerOwner(generation: number) {
  if (!isRadioSessionCurrent(generation)) {
    logRadioSwitchDiagnostic("stale_resolution_ignored", {
      generation,
      phase: "claim_player",
    });
    return false;
  }

  if (
    activePlayerOwnerGeneration != null &&
    activePlayerOwnerGeneration !== generation
  ) {
    logRadioSwitchDiagnostic("active_player_invariant_failed", {
      staleGeneration: activePlayerOwnerGeneration,
      generation,
      activePlayerCount: activeRadioPlayerCount,
    });
    activeRadioPlayerCount = Math.max(0, activeRadioPlayerCount - 1);
    activePlayerOwnerGeneration = null;
  }

  if (activePlayerOwnerGeneration === generation) {
    return true;
  }

  activePlayerOwnerGeneration = generation;
  activeRadioPlayerCount = 1;
  logRadioSwitchDiagnostic("radio_owner_claimed", {
    generation,
    activePlayerCount: activeRadioPlayerCount,
  });

  if (activeRadioPlayerCount > 1) {
    logRadioSwitchDiagnostic("active_player_invariant_failed", {
      activePlayerCount: activeRadioPlayerCount,
      generation,
    });
    activeRadioPlayerCount = 1;
  }

  return true;
}

export function releaseRadioPlayerOwner(generation: number, reason = "release") {
  if (activePlayerOwnerGeneration !== generation) return;
  activePlayerOwnerGeneration = null;
  activeRadioPlayerCount = 0;
  logRadioSwitchDiagnostic("radio_owner_released", {
    generation,
    reason,
    activePlayerCount: activeRadioPlayerCount,
  });
}

export function getActiveRadioPlayerCount() {
  return activeRadioPlayerCount;
}

export function assertSingleRadioPlayerOwner(context?: string) {
  if (activeRadioPlayerCount <= 1) return true;
  logRadioSwitchDiagnostic("active_player_invariant_failed", {
    context: context || "assert",
    activePlayerCount: activeRadioPlayerCount,
    ownerGeneration: activePlayerOwnerGeneration,
  });
  // Terminate the stale claim — keep at most one.
  activeRadioPlayerCount = activePlayerOwnerGeneration == null ? 0 : 1;
  return false;
}

export function computeRadioRetryDelayMs(attempt: number) {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const delay = RADIO_RETRY_BACKOFF_BASE_MS * Math.pow(2, safeAttempt);
  return Math.min(RADIO_RETRY_BACKOFF_MAX_MS, delay);
}

export function scheduleRadioRetry(options: {
  generation: number;
  attempt: number;
  failureClass: RadioRetryFailureClass;
  run: () => void | Promise<void>;
}): boolean {
  if (options.failureClass === "intentional_abort") {
    return false;
  }
  if (
    options.failureClass === "permanent_station_failure" ||
    options.failureClass === "unsupported_stream"
  ) {
    return false;
  }
  if (!isRadioSessionCurrent(options.generation)) {
    logRadioSwitchDiagnostic("stale_resolution_ignored", {
      generation: options.generation,
      phase: "schedule_retry",
    });
    return false;
  }
  if (options.attempt >= RADIO_MAX_STREAM_RETRY_ATTEMPTS) {
    logRadioSwitchDiagnostic("retry_cancelled", {
      reason: "max_attempts",
      attempt: options.attempt,
      failureClass: options.failureClass,
    });
    return false;
  }

  cancelRadioRetry("reschedule");
  retryAttempt = options.attempt;
  retryGeneration = options.generation;
  const delayMs = computeRadioRetryDelayMs(options.attempt);

  logRadioSwitchDiagnostic("retry_scheduled", {
    generation: options.generation,
    attempt: options.attempt,
    delayMs,
    failureClass: options.failureClass,
  });

  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (!isRadioSessionCurrent(options.generation)) {
      logRadioSwitchDiagnostic("stale_resolution_ignored", {
        generation: options.generation,
        phase: "retry_fire",
      });
      return;
    }
    void Promise.resolve()
      .then(() => options.run())
      .catch((error) => {
        if (isRadioSwitchAbortError(error)) return;
        logRadioSwitchDiagnostic("retry_cancelled", {
          reason: "retry_threw",
          error: String((error as Error)?.message || error),
        });
      });
  }, delayMs);

  return true;
}

/**
 * Ignore exact duplicate remote commands within a tiny window.
 * Does not block intentional repeated skipping of distinct presses spaced apart.
 */
export function shouldAcceptRemoteRadioCommand(command: string) {
  const normalized = String(command || "").trim().toLowerCase();
  if (!normalized) return false;
  const now = Date.now();
  if (
    lastRemoteCommand.command === normalized &&
    now - lastRemoteCommand.at < RADIO_REMOTE_COMMAND_COALESCE_MS
  ) {
    logRadioSwitchDiagnostic("duplicate_remote_command_ignored", {
      command: normalized,
      deltaMs: now - lastRemoteCommand.at,
    });
    return false;
  }
  lastRemoteCommand = { command: normalized, at: now };
  logRadioSwitchDiagnostic("remote_command_received", { command: normalized });
  return true;
}

export function shouldPublishRadioMetadata(
  generation: number,
  metadataKey: string
) {
  if (!isRadioSessionCurrent(generation)) {
    logRadioSwitchDiagnostic("stale_resolution_ignored", {
      generation,
      phase: "metadata_publish",
    });
    return false;
  }
  const key = String(metadataKey || "").trim();
  if (
    generation === lastPublishedMetadataGeneration &&
    key &&
    key === lastPublishedMetadataKey
  ) {
    return false;
  }
  return true;
}

export function markRadioMetadataPublished(
  generation: number,
  metadataKey: string
) {
  if (!isRadioSessionCurrent(generation)) return;
  lastPublishedMetadataGeneration = generation;
  lastPublishedMetadataKey = String(metadataKey || "").trim();
}

export function mapRemoteOrigin(
  source?: string | null,
  direction?: "next" | "previous"
): RadioSwitchOrigin {
  const normalized = String(source || "").toLowerCase();
  if (normalized === "failure") return "failure_fallback";
  if (normalized === "auto") return "auto";
  if (normalized === "carplay" || normalized === "remote") {
    return direction === "previous" ? "carplay_previous" : "carplay_next";
  }
  if (normalized === "lockscreen") return "lockscreen";
  if (direction === "previous") return "previous";
  if (direction === "next") return "mini_player_next";
  return "app";
}

export function __getRadioStationSwitchDebugState() {
  return {
    generation: radioSessionGeneration,
    stationId: activeSession?.stationId || null,
    mediaKey: activeSession?.mediaKey || null,
    origin: activeSession?.origin || null,
    aborted: Boolean(activeAbort?.signal.aborted),
    activePlayerCount: activeRadioPlayerCount,
    activePlayerOwnerGeneration,
    retryAttempt,
    retryGeneration,
    hasRetryTimer: Boolean(retryTimer),
    listenerRegistrationCount,
    lastPublishedMetadataKey,
    lastPublishedMetadataGeneration,
  };
}

export function __resetRadioStationSwitchForTests() {
  cancelRadioRetry("test_reset");
  abortActiveController("test_reset");
  radioSessionGeneration = 0;
  activeSession = null;
  stopSilencer = null;
  activePlayerOwnerGeneration = null;
  activeRadioPlayerCount = 0;
  retryAttempt = 0;
  retryGeneration = null;
  lastRemoteCommand = { command: "", at: 0 };
  lastPublishedMetadataKey = "";
  lastPublishedMetadataGeneration = 0;
  listenerRegistrationCount = 0;
}

import { isPlaybackReliabilityDiagnosticsEnabled } from "../constants/playbackConfig";

export type ReliabilityIssueCode =
  | "active_index_out_of_range"
  | "track_not_in_queue"
  | "queue_length_mismatch"
  | "metadata_mismatch"
  | "progress_invalid"
  | "progress_stale"
  | "duplicate_listener"
  | "state_transition";

export type ReliabilityIssue = {
  code: ReliabilityIssueCode;
  message: string;
  details?: Record<string, string | number | boolean | null | undefined>;
};

export type ReliabilityValidation = {
  ok: boolean;
  issues: ReliabilityIssue[];
};

export type PlaybackReliabilitySnapshot = {
  source: string;
  queueLength: number;
  activeIndex?: number | null;
  activeTrackId?: string | null;
  expectedQueueLength?: number;
  expectedActiveIndex?: number;
  expectedTrackId?: string | null;
  expectedTitle?: string | null;
  expectedArtist?: string | null;
  actualTitle?: string | null;
  actualArtist?: string | null;
  queueTrackIds?: string[];
  positionMillis?: number;
  durationMillis?: number;
  isPlaying?: boolean;
  playbackState?: string | null;
};

export type PlaybackProgressSample = {
  positionMillis: number;
  durationMillis: number;
  isPlaying: boolean;
};

const STALE_PROGRESS_MS = 18_000;
const STALE_PROGRESS_MIN_DELTA_MS = 250;

const listenerOwners = new Map<string, Set<string>>();
const remoteHandlerContexts = new Set<string>();

let lastPlaybackState: string | null = null;
let lastProgressSample: PlaybackProgressSample & { at: number } = {
  at: 0,
  positionMillis: 0,
  durationMillis: 0,
  isPlaying: false,
};

const recentIssues: ReliabilityIssue[] = [];
const MAX_RECENT_ISSUES = 24;

function enabled() {
  return isPlaybackReliabilityDiagnosticsEnabled();
}

function logEvent(event: string, details?: Record<string, unknown>) {
  if (!enabled()) return;

  console.log(`[HT:PlaybackReliability] ${event}`, {
    at: Date.now(),
    ...(details || {}),
  });
}

function recordIssue(issue: ReliabilityIssue) {
  if (!enabled()) return;

  recentIssues.push(issue);
  if (recentIssues.length > MAX_RECENT_ISSUES) {
    recentIssues.shift();
  }

  console.warn(`[HT:PlaybackReliability] ${issue.code}`, {
    at: Date.now(),
    message: issue.message,
    ...(issue.details || {}),
  });
}

function issue(
  code: ReliabilityIssueCode,
  message: string,
  details?: ReliabilityIssue["details"]
): ReliabilityIssue {
  return { code, message, details };
}

export function validateActiveIndex(
  activeIndex: number | null | undefined,
  queueLength: number
): ReliabilityValidation {
  const issues: ReliabilityIssue[] = [];

  if (queueLength <= 0) {
    if (activeIndex !== null && activeIndex !== undefined) {
      issues.push(
        issue("active_index_out_of_range", "Active index set on empty queue.", {
          activeIndex,
          queueLength,
        })
      );
    }
    return { ok: issues.length === 0, issues };
  }

  if (activeIndex === null || activeIndex === undefined) {
    issues.push(
      issue("active_index_out_of_range", "Missing active index for non-empty queue.", {
        queueLength,
      })
    );
    return { ok: false, issues };
  }

  if (!Number.isFinite(activeIndex) || activeIndex < 0 || activeIndex >= queueLength) {
    issues.push(
      issue("active_index_out_of_range", "Active index outside queue bounds.", {
        activeIndex,
        queueLength,
      })
    );
  }

  return { ok: issues.length === 0, issues };
}

export function validateTrackInQueue(
  trackId: string | null | undefined,
  queueTrackIds: string[]
): ReliabilityValidation {
  const issues: ReliabilityIssue[] = [];
  const normalizedId = String(trackId || "").trim();

  if (!normalizedId) {
    issues.push(
      issue("track_not_in_queue", "Active track id is missing.", {
        queueLength: queueTrackIds.length,
      })
    );
    return { ok: false, issues };
  }

  if (!queueTrackIds.includes(normalizedId)) {
    issues.push(
      issue("track_not_in_queue", "Active track id not found in queue.", {
        trackId: normalizedId,
        queueLength: queueTrackIds.length,
      })
    );
  }

  return { ok: issues.length === 0, issues };
}

export function validateQueueLengthConsistency(
  expectedLength: number | undefined,
  actualLength: number
): ReliabilityValidation {
  const issues: ReliabilityIssue[] = [];

  if (
    typeof expectedLength === "number" &&
    Number.isFinite(expectedLength) &&
    expectedLength !== actualLength
  ) {
    issues.push(
      issue("queue_length_mismatch", "Queue length differs from expected value.", {
        expectedLength,
        actualLength,
      })
    );
  }

  return { ok: issues.length === 0, issues };
}

export function validateMetadataMatch(
  expected: {
    id?: string | null;
    title?: string | null;
    artist?: string | null;
  },
  actual: {
    id?: string | null;
    title?: string | null;
    artist?: string | null;
  }
): ReliabilityValidation {
  const issues: ReliabilityIssue[] = [];

  const expectedId = String(expected.id || "").trim();
  const actualId = String(actual.id || "").trim();

  if (expectedId && actualId && expectedId !== actualId) {
    issues.push(
      issue("metadata_mismatch", "Active track id does not match expected song.", {
        expectedId,
        actualId,
      })
    );
  }

  const expectedTitle = String(expected.title || "").trim();
  const actualTitle = String(actual.title || "").trim();

  if (expectedTitle && actualTitle && expectedTitle !== actualTitle) {
    issues.push(
      issue("metadata_mismatch", "Active track title does not match expected song.", {
        expectedTitle,
        actualTitle,
      })
    );
  }

  const expectedArtist = String(expected.artist || "").trim();
  const actualArtist = String(actual.artist || "").trim();

  if (expectedArtist && actualArtist && expectedArtist !== actualArtist) {
    issues.push(
      issue("metadata_mismatch", "Active track artist does not match expected song.", {
        expectedArtist,
        actualArtist,
      })
    );
  }

  return { ok: issues.length === 0, issues };
}

export function validateProgressSanity(
  progress: PlaybackProgressSample
): ReliabilityValidation {
  const issues: ReliabilityIssue[] = [];
  const { positionMillis, durationMillis, isPlaying } = progress;

  if (!Number.isFinite(positionMillis) || positionMillis < 0) {
    issues.push(
      issue("progress_invalid", "Position millis is invalid.", {
        positionMillis,
      })
    );
  }

  if (!Number.isFinite(durationMillis) || durationMillis < 0) {
    issues.push(
      issue("progress_invalid", "Duration millis is invalid.", {
        durationMillis,
      })
    );
  }

  if (
    Number.isFinite(positionMillis) &&
    Number.isFinite(durationMillis) &&
    durationMillis > 0 &&
    positionMillis > durationMillis + 1500
  ) {
    issues.push(
      issue("progress_invalid", "Position exceeds duration.", {
        positionMillis,
        durationMillis,
      })
    );
  }

  if (isPlaying && durationMillis > 0 && positionMillis >= durationMillis - 250) {
    logEvent("progress_near_end", {
      positionMillis,
      durationMillis,
    });
  }

  return { ok: issues.length === 0, issues };
}

export function validateStaleProgress(
  progress: PlaybackProgressSample,
  now = Date.now()
): ReliabilityValidation {
  const issues: ReliabilityIssue[] = [];

  if (!progress.isPlaying) {
    lastProgressSample = { ...progress, at: now };
    return { ok: true, issues };
  }

  const elapsed = now - lastProgressSample.at;
  const delta = Math.abs(progress.positionMillis - lastProgressSample.positionMillis);

  if (
    lastProgressSample.at > 0 &&
    elapsed >= STALE_PROGRESS_MS &&
    delta < STALE_PROGRESS_MIN_DELTA_MS &&
    progress.isPlaying
  ) {
    issues.push(
      issue("progress_stale", "Playback position has not advanced while playing.", {
        elapsedMs: elapsed,
        positionMillis: progress.positionMillis,
        previousPositionMillis: lastProgressSample.positionMillis,
      })
    );
  }

  lastProgressSample = { ...progress, at: now };
  return { ok: issues.length === 0, issues };
}

export function runQueueConsistencyCheck(
  snapshot: PlaybackReliabilitySnapshot
): ReliabilityValidation {
  const issues: ReliabilityIssue[] = [];

  const queueChecks = [
    validateQueueLengthConsistency(
      snapshot.expectedQueueLength,
      snapshot.queueLength
    ),
    validateActiveIndex(snapshot.activeIndex, snapshot.queueLength),
  ];

  if (snapshot.queueTrackIds?.length && snapshot.activeTrackId) {
    queueChecks.push(
      validateTrackInQueue(snapshot.activeTrackId, snapshot.queueTrackIds)
    );
  }

  if (
    snapshot.expectedTrackId ||
    snapshot.expectedTitle ||
    snapshot.expectedArtist
  ) {
    queueChecks.push(
      validateMetadataMatch(
        {
          id: snapshot.expectedTrackId,
          title: snapshot.expectedTitle,
          artist: snapshot.expectedArtist,
        },
        {
          id: snapshot.activeTrackId,
          title: snapshot.actualTitle,
          artist: snapshot.actualArtist,
        }
      )
    );
  }

  if (
    typeof snapshot.expectedActiveIndex === "number" &&
    typeof snapshot.activeIndex === "number" &&
    snapshot.expectedActiveIndex !== snapshot.activeIndex
  ) {
    issues.push(
      issue("active_index_out_of_range", "Active index differs from expected index.", {
        expectedActiveIndex: snapshot.expectedActiveIndex,
        activeIndex: snapshot.activeIndex,
      })
    );
  }

  queueChecks.forEach((result) => {
    issues.push(...result.issues);
  });

  return { ok: issues.length === 0, issues };
}

export function observeQueueSnapshot(snapshot: PlaybackReliabilitySnapshot) {
  if (!enabled()) return;

  const validation = runQueueConsistencyCheck(snapshot);

  logEvent("queue_snapshot", {
    source: snapshot.source,
    queueLength: snapshot.queueLength,
    activeIndex: snapshot.activeIndex ?? null,
    activeTrackId: snapshot.activeTrackId ?? null,
    playbackState: snapshot.playbackState ?? null,
    ok: validation.ok,
    issueCount: validation.issues.length,
  });

  validation.issues.forEach(recordIssue);
}

export function observeProgressUpdate(
  progress: PlaybackProgressSample,
  source: string
) {
  if (!enabled()) return;

  const sanity = validateProgressSanity(progress);
  const stale = validateStaleProgress(progress);

  logEvent("progress_tick", {
    source,
    positionMillis: progress.positionMillis,
    durationMillis: progress.durationMillis,
    isPlaying: progress.isPlaying,
    ok: sanity.ok && stale.ok,
  });

  [...sanity.issues, ...stale.issues].forEach(recordIssue);
}

export function observePlaybackStateTransition(
  nextState: string,
  source: string,
  details?: Record<string, string | number | boolean | null | undefined>
) {
  if (!enabled()) return;

  const previousState = lastPlaybackState;
  lastPlaybackState = nextState;

  logEvent("state_transition", {
    source,
    previousState,
    nextState,
    ...(details || {}),
  });
}


export function registerRemoteHandlerContext(context: string): boolean {
  if (!enabled()) return true;

  if (remoteHandlerContexts.has(context)) {
    recordIssue(
      issue("duplicate_listener", "Remote handler context already registered.", {
        context,
      })
    );
    return false;
  }

  remoteHandlerContexts.add(context);
  logEvent("remote_handlers_registered", { context });
  return true;
}

export function unregisterRemoteHandlerContext(context: string) {
  if (!enabled()) return;
  remoteHandlerContexts.delete(context);
}

export function getPlaybackReliabilitySummary() {
  return {
    enabled: enabled(),
    lastPlaybackState,
    lastProgressSample,
    listenerRegistry: Array.from(listenerOwners.entries()).map(([eventName, owners]) => ({
      eventName,
      owners: Array.from(owners),
    })),
    remoteHandlerContexts: Array.from(remoteHandlerContexts),
    recentIssues: [...recentIssues],
  };
}

export async function inspectNativeQueueConsistency(
  source: string,
  expected?: {
    queueLength?: number;
    activeIndex?: number;
    trackId?: string | null;
    title?: string | null;
    artist?: string | null;
  },
  reader?: () => Promise<{
    queueLength: number;
    activeIndex: number | null;
    activeTrackId: string | null;
    actualTitle?: string | null;
    actualArtist?: string | null;
    queueTrackIds?: string[];
    playbackState?: string | null;
  } | null>
) {
  if (!enabled() || !reader) return;

  try {
    const snapshot = await reader();
    if (!snapshot) return;

    observeQueueSnapshot({
      source,
      queueLength: snapshot.queueLength,
      activeIndex: snapshot.activeIndex,
      activeTrackId: snapshot.activeTrackId,
      expectedQueueLength: expected?.queueLength,
      expectedActiveIndex: expected?.activeIndex,
      expectedTrackId: expected?.trackId ?? null,
      expectedTitle: expected?.title ?? null,
      expectedArtist: expected?.artist ?? null,
      actualTitle: snapshot.actualTitle ?? null,
      actualArtist: snapshot.actualArtist ?? null,
      queueTrackIds: snapshot.queueTrackIds,
      playbackState: snapshot.playbackState ?? null,
    });
  } catch (error) {
    logEvent("queue_inspection_failed", {
      source,
      message: String((error as Error)?.message || error),
    });
  }
}

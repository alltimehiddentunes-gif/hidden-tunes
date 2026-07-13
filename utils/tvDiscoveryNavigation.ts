import { fetchTvPlayback, type HiddenTunesTvPlayback } from "@/services/tvCatalogApi";
import type { TvDiscoverySession, TvQueueItem, TvStationPlayResult } from "@/types/tvDiscovery";
import {
  appendTvSessionItems,
  bumpTvResolutionSequence,
  getActiveHierarchyLayerIndex,
  getTvDiscoverySession,
  getTvSessionStationById,
  markTvSessionStationFailed,
  setTvSessionCurrentFromHistory,
  setTvSessionPendingCandidate,
  updateTvDiscoverySession,
  updateTvHierarchyLayer,
} from "@/services/tvDiscoverySessionStore";
import {
  buildDiscoveryHierarchyLayers,
  fetchHierarchyLayerPage,
  sortRelatedCandidates,
  TV_DISCOVERY_PREFETCH_THRESHOLD,
} from "@/utils/tvDiscoveryHierarchy";
import {
  beginTvMetadataPrefetch,
  beginTvResolutionRequest,
  finishTvMetadataPrefetch,
  isAbortError,
  isRequestAborted,
} from "@/services/tvDiscoveryAbort";
import { clearTvPlaybackFailure, recordTvPlaybackFailure } from "@/utils/tvPlaybackFailureStore";
import { queueItemToHiddenTunesTvVideo } from "@/utils/tvStationItem";
import {
  isResolvedStreamPlayable,
  TV_NAV_EXHAUSTED,
  TV_NAV_NO_SESSION,
  TV_NAV_SKIPPED,
  TV_NAV_STALE,
} from "@/utils/tvPlayabilityGate";

/** Per user navigation tap — soft budget before expanding hierarchy within one sweep. */
export const TV_MAX_AUTO_SKIP_ATTEMPTS = 8;
/** Total candidate attempts before true exhaustion during one recovery action. */
export const TV_RECOVERY_MAX_CANDIDATES = 64;
/** Internal open/recovery hierarchy sweeps. */
export const TV_INTERNAL_RECOVERY_MAX_ROUNDS = 16;

export { cancelTvDiscoveryResolution, cancelTvMetadataPrefetch } from "@/services/tvDiscoveryAbort";

function logTvNext(event: string, details: Record<string, unknown> = {}) {
  if (!__DEV__) return;
  console.log(`[tv_next] ${event}`, details);
}

async function resolveStationPlayback(
  station: TvQueueItem,
  signal?: AbortSignal
): Promise<HiddenTunesTvPlayback | null> {
  return fetchTvPlayback(queueItemToHiddenTunesTvVideo(station), { signal });
}

function shouldSkipCandidate(session: TvDiscoverySession, stationId: string) {
  if (!stationId) return true;
  if (session.confirmedActiveStation?.stationId === stationId) return true;
  if (session.pendingCandidateStation?.stationId === stationId) return true;
  if (session.failedStationIds[stationId]) return true;
  return false;
}

async function extendSessionQueue(session: TvDiscoverySession, signal?: AbortSignal) {
  let layerIndex = getActiveHierarchyLayerIndex(session);
  if (layerIndex < 0) return false;

  while (layerIndex < session.hierarchyLayers.length) {
    if (isRequestAborted(signal)) return false;

    const layer = session.hierarchyLayers[layerIndex];
    if (layer.exhausted) {
      layerIndex += 1;
      continue;
    }

    if (layer.loading) return false;

    updateTvHierarchyLayer(layerIndex, { loading: true });

    try {
      const page = await fetchHierarchyLayerPage(layer, signal);
      updateTvHierarchyLayer(layerIndex, {
        loading: false,
        page: page.hasMore ? page.nextPage : layer.page,
        hasMore: page.hasMore,
        exhausted: !page.items.length && !page.hasMore,
      });

      if (page.items.length) {
        const sorted =
          layer.level > 0
            ? sortRelatedCandidates(session.items[session.currentIndex], page.items)
            : page.items;

        appendTvSessionItems(sorted);
        updateTvDiscoverySession({
          activeLayerLabel: layer.label,
          hierarchyPath: [...session.hierarchyPath, layer.label],
        });
        return true;
      }

      if (!page.hasMore) {
        layerIndex += 1;
        continue;
      }

      return false;
    } catch (error) {
      updateTvHierarchyLayer(layerIndex, { loading: false });
      if (isRequestAborted(signal) || isAbortError(error)) {
        return false;
      }
      updateTvHierarchyLayer(layerIndex, { exhausted: true });
      layerIndex += 1;
    }
  }

  return false;
}

async function prefetchIfNeeded(session: TvDiscoverySession) {
  const remaining = session.items.length - session.currentIndex - 1;
  if (remaining > TV_DISCOVERY_PREFETCH_THRESHOLD) return;

  const metadataSignal = beginTvMetadataPrefetch();
  if (!metadataSignal) return;

  try {
    const layerIndex = getActiveHierarchyLayerIndex(session);
    if (layerIndex < 0) return;

    const layer = session.hierarchyLayers[layerIndex];
    if (!layer || layer.loading || layer.exhausted || !layer.hasMore) {
      if (remaining <= 1) {
        await extendSessionQueue(session, metadataSignal);
      }
      return;
    }

    await extendSessionQueue(session, metadataSignal);
  } finally {
    finishTvMetadataPrefetch(metadataSignal);
  }
}

async function resolveCandidateAtIndex(
  session: TvDiscoverySession,
  index: number,
  resolutionSequence: number,
  signal?: AbortSignal
): Promise<TvStationPlayResult> {
  const station = session.items[index];
  if (!station) {
    return { ok: false, error: TV_NAV_EXHAUSTED, exhausted: true };
  }

  if (shouldSkipCandidate(session, station.stationId)) {
    logTvNext("tv_next_candidate_rejected", {
      stationId: station.stationId,
      reason: "skip_guard",
      generation: resolutionSequence,
    });
    return { ok: false, error: TV_NAV_SKIPPED, attempts: 1 };
  }

  let playback: HiddenTunesTvPlayback | null = null;

  try {
    logTvNext("tv_next_resolve_started", {
      stationId: station.stationId,
      generation: resolutionSequence,
    });
    playback = await resolveStationPlayback(station, signal);
  } catch (error) {
    if (isRequestAborted(signal) || isAbortError(error)) {
      return { ok: false, error: TV_NAV_STALE, attempts: 0 };
    }
    markTvSessionStationFailed(station.stationId, "resolve_error");
    await recordTvPlaybackFailure(station.stationId);
    logTvNext("tv_next_resolve_failed", {
      stationId: station.stationId,
      reason: "resolve_error",
      generation: resolutionSequence,
    });
    return { ok: false, error: "resolve_error", attempts: 1 };
  }

  const latest = getTvDiscoverySession();
  if (!latest || latest.resolutionSequence !== resolutionSequence) {
    return { ok: false, error: TV_NAV_STALE, attempts: 0 };
  }

  if (!isResolvedStreamPlayable(playback)) {
    markTvSessionStationFailed(station.stationId, "stream_blocked");
    await recordTvPlaybackFailure(station.stationId);
    logTvNext("tv_next_candidate_rejected", {
      stationId: station.stationId,
      reason: "stream_blocked",
      generation: resolutionSequence,
    });
    return { ok: false, error: "stream_blocked", attempts: 1 };
  }

  await clearTvPlaybackFailure(station.stationId);
  logTvNext("tv_next_candidate_selected", {
    stationId: station.stationId,
    generation: resolutionSequence,
  });

  setTvSessionPendingCandidate({
    index,
    station,
    streamUrl: playback!.stream_url,
    sourceType: playback!.source_type,
  });

  updateTvDiscoverySession({
    activeLayerLabel: station.hierarchyLabel || latest!.activeLayerLabel,
  });

  return {
    ok: true,
    station,
    streamUrl: playback!.stream_url,
    sourceType: playback!.source_type,
    resolutionSequence,
    candidateIndex: index,
    pendingOnly: true,
  };
}

async function exploreForwardNewStation(
  signal?: AbortSignal,
  maxAttempts = TV_MAX_AUTO_SKIP_ATTEMPTS
): Promise<TvStationPlayResult> {
  const session = getTvDiscoverySession();
  if (!session) {
    return { ok: false, error: TV_NAV_NO_SESSION, exhausted: true };
  }

  let attempts = 0;
  let index = session.currentIndex + 1;

  while (attempts < maxAttempts) {
    if (isRequestAborted(signal)) {
      return { ok: false, error: TV_NAV_STALE, attempts: 0 };
    }

    const latest = getTvDiscoverySession();
    if (!latest) {
      return { ok: false, error: TV_NAV_NO_SESSION, exhausted: true };
    }

    if (index >= latest.items.length) {
      const extended = await extendSessionQueue(latest, signal);
      if (!extended) {
        return {
          ok: false,
          error: TV_NAV_EXHAUSTED,
          exhausted: true,
          attempts,
        };
      }
      continue;
    }

    if (shouldSkipCandidate(latest, latest.items[index]?.stationId || "")) {
      index += 1;
      continue;
    }

    if (latest.playedStationIds.includes(latest.items[index]?.stationId || "")) {
      index += 1;
      continue;
    }

    const resolutionSequence = bumpTvResolutionSequence();
    const result = await resolveCandidateAtIndex(latest, index, resolutionSequence, signal);

    if (result.ok) {
      const refreshed = getTvDiscoverySession();
      if (refreshed) {
        void prefetchIfNeeded(refreshed);
      }
      return result;
    }

    if (result.error === TV_NAV_STALE) {
      return result;
    }

    if (result.error === TV_NAV_SKIPPED) {
      index += 1;
      continue;
    }

    attempts += 1;
    index += 1;
  }

  return {
    ok: false,
    error: TV_NAV_EXHAUSTED,
    attempts,
  };
}

export async function exploreForwardUntilPlayable(
  signal?: AbortSignal,
  maxCandidates = TV_RECOVERY_MAX_CANDIDATES
): Promise<TvStationPlayResult> {
  let attempts = 0;
  let sweeps = 0;

  while (attempts < maxCandidates && sweeps < TV_INTERNAL_RECOVERY_MAX_ROUNDS) {
    const session = getTvDiscoverySession();
    if (!session) {
      return { ok: false, error: TV_NAV_NO_SESSION, exhausted: true };
    }

    let index = session.currentIndex + 1;

    while (attempts < maxCandidates) {
      if (isRequestAborted(signal)) {
        return { ok: false, error: TV_NAV_STALE, attempts: 0 };
      }

      const latest = getTvDiscoverySession();
      if (!latest) {
        return { ok: false, error: TV_NAV_NO_SESSION, exhausted: true };
      }

      if (index >= latest.items.length) {
        const extended = await extendSessionQueue(latest, signal);
        if (!extended) {
          break;
        }
        continue;
      }

      if (shouldSkipCandidate(latest, latest.items[index]?.stationId || "")) {
        index += 1;
        continue;
      }

      if (latest.playedStationIds.includes(latest.items[index]?.stationId || "")) {
        index += 1;
        continue;
      }

      const resolutionSequence = bumpTvResolutionSequence();
      const result = await resolveCandidateAtIndex(latest, index, resolutionSequence, signal);
      attempts += 1;

      if (result.ok) {
        const refreshed = getTvDiscoverySession();
        if (refreshed) {
          void prefetchIfNeeded(refreshed);
        }
        return result;
      }

      if (result.error === TV_NAV_STALE) {
        return result;
      }

      index += 1;
    }

    sweeps += 1;
  }

  return { ok: false, error: TV_NAV_EXHAUSTED, exhausted: true, attempts };
}

export async function playTvDiscoveryStationAtIndex(
  index: number
): Promise<TvStationPlayResult> {
  const signal = beginTvResolutionRequest();

  const session = getTvDiscoverySession();
  if (!session) {
    return { ok: false, error: TV_NAV_NO_SESSION, exhausted: true };
  }

  const resolutionSequence = bumpTvResolutionSequence();
  const result = await resolveCandidateAtIndex(session, index, resolutionSequence, signal);

  if (result.ok) {
    const latest = getTvDiscoverySession();
    if (latest) {
      void prefetchIfNeeded(latest);
    }
    return result;
  }

  if (result.error === TV_NAV_STALE || result.error === TV_NAV_SKIPPED) {
    return result;
  }

  const failedId = session.items[index]?.stationId || "";
  if (failedId) {
    markTvSessionStationFailed(failedId, "initial_resolve_failed");
  }

  return exploreForwardUntilPlayable(signal);
}

export async function tvDiscoveryNextStation(): Promise<TvStationPlayResult> {
  const signal = beginTvResolutionRequest();

  const session = getTvDiscoverySession();
  if (!session) {
    return { ok: false, error: TV_NAV_NO_SESSION, exhausted: true };
  }

  if (session.playedHistoryIndex < session.playedHistory.length - 1) {
    const nextHistoryIndex = session.playedHistoryIndex + 1;
    const nextHistoryId = session.playedHistory[nextHistoryIndex];
    const index = session.items.findIndex((item) => item.stationId === nextHistoryId);
    if (index >= 0) {
      session.playedHistoryIndex = nextHistoryIndex;
      const resolutionSequence = bumpTvResolutionSequence();
      const result = await resolveCandidateAtIndex(session, index, resolutionSequence, signal);
      if (result.ok || result.error === TV_NAV_STALE) {
        return result;
      }
    }
  }

  const forward = await exploreForwardUntilPlayable(signal);
  return forward;
}

export async function tvDiscoveryPreviousStation(): Promise<TvStationPlayResult> {
  const signal = beginTvResolutionRequest();

  const session = getTvDiscoverySession();
  if (!session) {
    return { ok: false, error: TV_NAV_NO_SESSION, exhausted: true };
  }

  if (session.playedHistoryIndex <= 0) {
    return playTvDiscoveryStationAtIndex(session.currentIndex);
  }

  session.playedHistoryIndex -= 1;
  const stationId = session.playedHistory[session.playedHistoryIndex];
  const station = getTvSessionStationById(stationId);

  if (!station) {
    return { ok: false, error: TV_NAV_EXHAUSTED, exhausted: true };
  }

  const index = session.items.findIndex((item) => item.stationId === stationId);
  const resolutionSequence = bumpTvResolutionSequence();
  return resolveCandidateAtIndex(
    session,
    index >= 0 ? index : session.currentIndex,
    resolutionSequence,
    signal
  );
}

export function rebuildHierarchyForSession(
  launch: Parameters<typeof buildDiscoveryHierarchyLayers>[0],
  anchor: TvQueueItem
) {
  return buildDiscoveryHierarchyLayers(launch, anchor);
}

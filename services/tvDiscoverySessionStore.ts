import type {
  TvDiscoveryLaunchContext,
  TvDiscoverySession,
  TvHierarchyLayer,
  TvQueueItem,
} from "@/types/tvDiscovery";
import { dedupeTvQueueItems } from "@/utils/tvStationItem";

let activeSession: TvDiscoverySession | null = null;

export function getTvDiscoverySession() {
  return activeSession;
}

export function clearTvDiscoverySession() {
  activeSession = null;
}

export function createTvDiscoverySession(input: {
  launch: TvDiscoveryLaunchContext;
  items: TvQueueItem[];
  startIndex: number;
  hierarchyLayers: TvHierarchyLayer[];
}) {
  const seenStationIds: Record<string, true> = {};
  const items = dedupeTvQueueItems(input.items, seenStationIds);
  const safeIndex = Math.max(0, Math.min(input.startIndex, Math.max(items.length - 1, 0)));
  const anchor = items[safeIndex];

  activeSession = {
    queueType: "tv",
    contextType: input.launch.contextType,
    contextId: input.launch.contextId,
    contextTitle: input.launch.contextTitle,
    sourceContextType: input.launch.sourceContextType || input.launch.contextType,
    sourceContextId: input.launch.sourceContextId || input.launch.contextId,
    sourceContextTitle: input.launch.sourceContextTitle || input.launch.contextTitle,
    originalContext: input.launch,
    items,
    currentIndex: safeIndex,
    hierarchyLayers: input.hierarchyLayers,
    activeLayerLabel: anchor?.hierarchyLabel || input.launch.contextTitle,
    hierarchyPath: [input.launch.contextTitle],
    metadataMode: input.launch.metadataMode || "quality_metadata",
    seenStationIds,
    failedStationIds: {},
    playedStationIds: [],
    playedHistory: [],
    playedHistoryIndex: -1,
    resolutionSequence: 0,
    transitionGeneration: 0,
    confirmedActiveStation: null,
    confirmedStreamUrl: "",
    confirmedSourceType: "",
    pendingCandidateStation: null,
    pendingCandidateIndex: -1,
    pendingStreamUrl: "",
    pendingSourceType: "",
  };

  return activeSession;
}

export function updateTvDiscoverySession(patch: Partial<TvDiscoverySession>) {
  if (!activeSession) return null;
  activeSession = { ...activeSession, ...patch };
  return activeSession;
}

export function markTvSessionStationFailed(stationId: string, reason: string) {
  if (!activeSession) return;
  activeSession.failedStationIds[stationId] = reason;
}

export function markTvSessionStationSeen(stationId: string) {
  if (!activeSession) return;
  activeSession.seenStationIds[stationId] = true;
}

export function appendTvSessionItems(newItems: TvQueueItem[]) {
  if (!activeSession) return activeSession;

  const merged = dedupeTvQueueItems(newItems, activeSession.seenStationIds);
  if (!merged.length) return activeSession;

  activeSession = {
    ...activeSession,
    items: [...activeSession.items, ...merged],
  };

  return activeSession;
}

export function setTvSessionCurrentFromHistory(index: number) {
  if (!activeSession) return null;
  activeSession.currentIndex = index;
  return activeSession;
}

export function setTvSessionCurrentIndex(index: number, stationId: string) {
  if (!activeSession) return null;

  activeSession.currentIndex = index;

  if (activeSession.playedHistoryIndex < activeSession.playedHistory.length - 1) {
    activeSession.playedHistory = activeSession.playedHistory.slice(
      0,
      activeSession.playedHistoryIndex + 1
    );
  }

  if (activeSession.playedHistory[activeSession.playedHistory.length - 1] !== stationId) {
    activeSession.playedHistory.push(stationId);
  }

  activeSession.playedHistoryIndex = activeSession.playedHistory.length - 1;

  if (!activeSession.playedStationIds.includes(stationId)) {
    activeSession.playedStationIds.push(stationId);
  }

  return activeSession;
}

export function bumpTvResolutionSequence() {
  if (!activeSession) return 0;
  activeSession.resolutionSequence += 1;
  return activeSession.resolutionSequence;
}

export function getTvSessionStationById(stationId: string) {
  if (!activeSession) return null;
  return activeSession.items.find((item) => item.stationId === stationId) || null;
}

export function updateTvHierarchyLayer(layerIndex: number, patch: Partial<TvHierarchyLayer>) {
  if (!activeSession) return;
  activeSession.hierarchyLayers = activeSession.hierarchyLayers.map((layer, index) =>
    index === layerIndex ? { ...layer, ...patch } : layer
  );
}

export function getActiveHierarchyLayerIndex(session: TvDiscoverySession) {
  return session.hierarchyLayers.findIndex((layer) => !layer.exhausted);
}

export function getTvSessionWindow(session: TvDiscoverySession) {
  const start = Math.max(0, session.currentIndex - 20);
  const end = Math.min(session.items.length, session.currentIndex + 81);
  return session.items.slice(start, end);
}

export function setTvSessionPendingCandidate(input: {
  index: number;
  station: TvQueueItem;
  streamUrl: string;
  sourceType: string;
}) {
  if (!activeSession) return null;

  activeSession = {
    ...activeSession,
    pendingCandidateStation: input.station,
    pendingCandidateIndex: input.index,
    pendingStreamUrl: input.streamUrl,
    pendingSourceType: input.sourceType,
    transitionGeneration: activeSession.transitionGeneration + 1,
  };

  return activeSession;
}

export function clearTvSessionPendingCandidate() {
  if (!activeSession) return null;

  activeSession = {
    ...activeSession,
    pendingCandidateStation: null,
    pendingCandidateIndex: -1,
    pendingStreamUrl: "",
    pendingSourceType: "",
  };

  return activeSession;
}

export function confirmTvSessionActiveStation() {
  if (!activeSession?.pendingCandidateStation) return null;

  const station = activeSession.pendingCandidateStation;
  const index =
    activeSession.pendingCandidateIndex >= 0
      ? activeSession.pendingCandidateIndex
      : activeSession.items.findIndex((item) => item.stationId === station.stationId);

  if (index >= 0) {
    activeSession.currentIndex = index;
  }

  const stationId = station.stationId;

  if (activeSession.playedHistory[activeSession.playedHistoryIndex] !== stationId) {
    if (activeSession.playedHistoryIndex < activeSession.playedHistory.length - 1) {
      activeSession.playedHistory = activeSession.playedHistory.slice(
        0,
        activeSession.playedHistoryIndex + 1
      );
    }
    activeSession.playedHistory.push(stationId);
    activeSession.playedHistoryIndex = activeSession.playedHistory.length - 1;
  }

  if (!activeSession.playedStationIds.includes(stationId)) {
    activeSession.playedStationIds.push(stationId);
  }

  activeSession.confirmedActiveStation = station;
  activeSession.confirmedStreamUrl = activeSession.pendingStreamUrl;
  activeSession.confirmedSourceType = activeSession.pendingSourceType;
  activeSession.pendingCandidateStation = null;
  activeSession.pendingCandidateIndex = -1;
  activeSession.pendingStreamUrl = "";
  activeSession.pendingSourceType = "";
  activeSession.activeLayerLabel = station.hierarchyLabel || activeSession.activeLayerLabel;
  activeSession.transitionGeneration += 1;

  return activeSession;
}

export function releaseTvSessionPendingCandidate() {
  if (!activeSession?.pendingCandidateStation) return null;

  activeSession = {
    ...activeSession,
    pendingCandidateStation: null,
    pendingCandidateIndex: -1,
    pendingStreamUrl: "",
    pendingSourceType: "",
    transitionGeneration: activeSession.transitionGeneration + 1,
  };

  return activeSession;
}

import { AppState } from "react-native";

import { logPerformanceEvent } from "./performanceEvents";
import { getPlaybackStartupGateStatus } from "./playbackStartupGate";
import { getPlaybackStressDiagnostics } from "./playbackStressDiagnostics";

export type PlaybackSourceType = "r2" | "cloud" | "local" | "unknown";

export type PlaybackStartupMilestone =
  | "tap_received_ms"
  | "playSong_enter_ms"
  | "queue_prepare_ms"
  | "state_commit_before_audio_ms"
  | "loadAndPlay_enter_ms"
  | "source_resolution_ms"
  | "audio_mode_ms"
  | "unload_previous_sound_ms"
  | "audio_object_create_ms"
  | "play_async_ms"
  | "first_status_playing_ms"
  | "first_position_advance_ms"
  | "playback_started_log_ms"
  | "side_effects_after_playback_ms";

type PendingTap = {
  tapReceivedAt: number;
  songId?: string;
  screen?: string;
  source?: string;
};

type ActiveProfile = {
  sessionId: string;
  tapReceivedAt: number;
  songId?: string;
  screen?: string;
  source?: string;
  milestones: Partial<Record<PlaybackStartupMilestone, number>>;
  meta: Record<string, string | number | boolean | undefined>;
  playAsyncStartedAt: number | null;
  sideEffectsStartedAt: number | null;
  loggedBreakdown: boolean;
};

const MAX_PROFILE_SAMPLES = 16;

let pendingTap: PendingTap | null = null;
let activeProfile: ActiveProfile | null = null;

const breakdownSamples: Array<Record<string, string | number | boolean | undefined>> =
  [];

let lastBreakdown: Record<string, string | number | boolean | undefined> | null =
  null;

function shouldTrack() {
  return typeof __DEV__ === "undefined" || __DEV__;
}

function nowMs() {
  return Date.now();
}

function createSessionId() {
  return `pb-${nowMs()}-${Math.random().toString(36).slice(2, 8)}`;
}

function elapsedSinceTap(profile: ActiveProfile, at = nowMs()) {
  return Math.max(0, at - profile.tapReceivedAt);
}

function markMilestone(profile: ActiveProfile, key: PlaybackStartupMilestone, at = nowMs()) {
  if (profile.milestones[key] !== undefined) return;

  profile.milestones[key] = elapsedSinceTap(profile, at);

  if (key === "tap_received_ms") {
    profile.milestones[key] = 0;
  }
}

export function primePlaybackTapReceived(
  tapReceivedAt: number,
  details: Record<string, string | number | boolean | undefined> = {}
) {
  if (!shouldTrack()) return;

  pendingTap = {
    tapReceivedAt,
    songId: details.songId ? String(details.songId) : undefined,
    screen: details.screen ? String(details.screen) : undefined,
    source: details.source ? String(details.source) : undefined,
  };
}

export function beginPlaybackStartupProfile(
  details: Record<string, string | number | boolean | undefined> = {}
) {
  if (!shouldTrack()) return;

  const tap =
    pendingTap && (!details.songId || pendingTap.songId === String(details.songId))
      ? pendingTap
      : null;

  pendingTap = null;

  const tapReceivedAt = tap?.tapReceivedAt ?? nowMs();

  activeProfile = {
    sessionId: createSessionId(),
    tapReceivedAt,
    songId: String(details.songId || tap?.songId || ""),
    screen: String(details.screen || tap?.screen || details.source || tap?.source || ""),
    source: String(details.source || tap?.source || "playSong"),
    milestones: {},
    meta: { ...details },
    playAsyncStartedAt: null,
    sideEffectsStartedAt: null,
    loggedBreakdown: false,
  };

  markMilestone(activeProfile, "tap_received_ms", tapReceivedAt);
  markMilestone(activeProfile, "playSong_enter_ms");
  attachPlaybackPressureSnapshot();
}

export function markPlaybackProfileMilestone(
  key: PlaybackStartupMilestone,
  extra: Record<string, string | number | boolean | undefined> = {}
) {
  if (!shouldTrack() || !activeProfile) return;

  markMilestone(activeProfile, key);

  Object.assign(activeProfile.meta, extra);
}

export function markPlaybackProfileDuration(
  key: PlaybackStartupMilestone,
  durationMs: number,
  extra: Record<string, string | number | boolean | undefined> = {}
) {
  if (!shouldTrack() || !activeProfile) return;

  activeProfile.milestones[key] = Math.max(
    0,
    Math.round(durationMs)
  );

  Object.assign(activeProfile.meta, extra);

  logPerformanceEvent("playback_startup_phase", {
    sessionId: activeProfile.sessionId,
    phase: key,
    durationMs: activeProfile.milestones[key],
    sinceTapMs: elapsedSinceTap(activeProfile),
    ...extra,
  });
}

export function attachPlaybackProfileContext(
  extra: Record<string, string | number | boolean | undefined> = {}
) {
  if (!activeProfile) return;

  Object.assign(activeProfile.meta, extra);
}

export function attachPlaybackPressureSnapshot() {
  if (!activeProfile) return;

  const gate = getPlaybackStartupGateStatus();
  const stress = getPlaybackStressDiagnostics();

  Object.assign(activeProfile.meta, {
    activeDeferredCount: stress.activeDeferredTasks,
    deferredRunning: gate.deferredRunning,
    trackedDeferredTasks: gate.trackedDeferred,
    activeTimerCount: stress.activeTimerCount,
    appState: AppState.currentState,
    playbackStartupGateActive: gate.playbackStartupActive,
  });
}

export function classifyPlaybackSource(
  song: {
    type?: string;
    streamUrl?: string;
    url?: string;
    audioUrl?: string;
    isOnline?: boolean;
  },
  playableUri?: string | null
): PlaybackSourceType {
  const type = String(song?.type || "").toLowerCase();

  if (type === "r2" || type === "cloud") {
    return type === "r2" ? "r2" : "cloud";
  }

  const uri = String(
    playableUri || song?.streamUrl || song?.url || song?.audioUrl || ""
  ).toLowerCase();

  if (!uri) return "unknown";
  if (uri.startsWith("file://")) return "local";

  if (
    uri.includes("r2.cloudflarestorage.com") ||
    uri.includes("/r2/") ||
    uri.includes("hidden-tunes") ||
    uri.includes("htunes")
  ) {
    return "r2";
  }

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    return "cloud";
  }

  return "unknown";
}

export function parseAudioUrlHost(playableUri?: string | null) {
  if (!playableUri) return "none";

  try {
    const parsed = new URL(String(playableUri));
    return parsed.host || "unknown";
  } catch {
    return "invalid";
  }
}

export function beginPlaybackProfilePlayAsync() {
  if (!activeProfile) return;

  activeProfile.playAsyncStartedAt = nowMs();
}

export function completePlaybackProfilePlayAsync(
  extra: Record<string, string | number | boolean | undefined> = {}
) {
  if (!activeProfile || activeProfile.playAsyncStartedAt === null) return;

  const durationMs = nowMs() - activeProfile.playAsyncStartedAt;
  activeProfile.playAsyncStartedAt = null;

  markPlaybackProfileDuration("play_async_ms", durationMs, extra);
}

export function notifyPlaybackProfileStatusUpdate(
  status: {
    isLoaded?: boolean;
    isPlaying?: boolean;
    positionMillis?: number;
  },
  songId?: string
) {
  if (!activeProfile || !status.isLoaded) return;

  if (
    status.isPlaying &&
    activeProfile.milestones.first_status_playing_ms === undefined
  ) {
    markMilestone(activeProfile, "first_status_playing_ms");
    logPerformanceEvent("playback_first_status_playing", {
      sessionId: activeProfile.sessionId,
      songId: songId || activeProfile.songId,
      sinceTapMs: activeProfile.milestones.first_status_playing_ms,
    });
    maybeFinalizePlaybackStartupProfile("first_status_playing");
  }

  if (
    (status.positionMillis || 0) > 0 &&
    activeProfile.milestones.first_position_advance_ms === undefined
  ) {
    markMilestone(activeProfile, "first_position_advance_ms");
    logPerformanceEvent("playback_first_position_advance", {
      sessionId: activeProfile.sessionId,
      songId: songId || activeProfile.songId,
      positionMillis: status.positionMillis,
      sinceTapMs: activeProfile.milestones.first_position_advance_ms,
    });
    maybeFinalizePlaybackStartupProfile("first_position");
  }
}

export function markPlaybackProfilePlaybackStartedLog() {
  markPlaybackProfileMilestone("playback_started_log_ms");

  if (!shouldTrack() || !activeProfile) return;

  const sessionId = activeProfile.sessionId;

  setTimeout(() => {
    if (!activeProfile || activeProfile.sessionId !== sessionId) return;
    if (activeProfile.loggedBreakdown) return;

    maybeFinalizePlaybackStartupProfile("playback_started_log");
  }, 450);

  setTimeout(() => {
    if (!activeProfile || activeProfile.sessionId !== sessionId) return;
    if (activeProfile.loggedBreakdown) return;

    maybeFinalizePlaybackStartupProfile("playback_started_timeout");
  }, 5000);
}

export function beginPlaybackProfileSideEffects() {
  if (!activeProfile) return;

  activeProfile.sideEffectsStartedAt = nowMs();
}

export function completePlaybackProfileSideEffects(
  extra: Record<string, string | number | boolean | undefined> = {}
) {
  if (!activeProfile || activeProfile.sideEffectsStartedAt === null) return;

  const durationMs = nowMs() - activeProfile.sideEffectsStartedAt;
  activeProfile.sideEffectsStartedAt = null;

  markPlaybackProfileDuration("side_effects_after_playback_ms", durationMs, extra);
  maybeFinalizePlaybackStartupProfile("side_effects");
}

export function cancelPlaybackStartupProfile(reason = "cancelled") {
  if (!shouldTrack() || !activeProfile) return;

  logPerformanceEvent("playback_startup_profile_cancelled", {
    sessionId: activeProfile.sessionId,
    reason,
    waitedMs: elapsedSinceTap(activeProfile),
  });

  activeProfile = null;
}

function fillMissingPlaybackMilestones(profile: ActiveProfile) {
  const m = profile.milestones;

  if (m.play_async_ms === undefined) {
    m.play_async_ms =
      m.audio_object_create_ms !== undefined ? 0 : m.playback_started_log_ms;
    profile.meta.playAsyncIncludedInCreate = m.play_async_ms === 0;
  }

  if (
    m.first_status_playing_ms === undefined &&
    m.playback_started_log_ms !== undefined
  ) {
    m.first_status_playing_ms = m.playback_started_log_ms;
    profile.meta.firstPlayingProxiedFromStartedLog = true;
  }

  if (
    m.first_position_advance_ms === undefined &&
    m.first_status_playing_ms !== undefined
  ) {
    m.first_position_advance_ms = m.first_status_playing_ms;
    profile.meta.firstPositionProxiedFromPlaying = true;
  }
}

function buildBreakdownPayload(
  profile: ActiveProfile,
  reason: string
): Record<string, string | number | boolean | undefined> {
  fillMissingPlaybackMilestones(profile);
  const m = profile.milestones;

  return {
    reason,
    sessionId: profile.sessionId,
    songId: profile.songId,
    screen: profile.screen,
    source: profile.source,
    tap_received_ms: m.tap_received_ms ?? 0,
    playSong_enter_ms: m.playSong_enter_ms,
    queue_prepare_ms: m.queue_prepare_ms,
    state_commit_before_audio_ms: m.state_commit_before_audio_ms,
    loadAndPlay_enter_ms: m.loadAndPlay_enter_ms,
    source_resolution_ms: m.source_resolution_ms,
    audio_mode_ms: m.audio_mode_ms,
    unload_previous_sound_ms: m.unload_previous_sound_ms,
    audio_object_create_ms: m.audio_object_create_ms,
    play_async_ms: m.play_async_ms,
    first_status_playing_ms: m.first_status_playing_ms,
    first_position_advance_ms: m.first_position_advance_ms,
    playback_started_log_ms: m.playback_started_log_ms,
    side_effects_after_playback_ms: m.side_effects_after_playback_ms,
    totalTapToPlaybackStartedMs: m.playback_started_log_ms,
    totalTapToFirstPlayingMs: m.first_status_playing_ms,
    totalTapToFirstPositionMs: m.first_position_advance_ms,
    ...profile.meta,
  };
}

function maybeFinalizePlaybackStartupProfile(reason: string) {
  if (!activeProfile || activeProfile.loggedBreakdown) return;

  const profile = activeProfile;
  profile.loggedBreakdown = true;

  const payload = buildBreakdownPayload(profile, reason);
  lastBreakdown = payload;

  breakdownSamples.push(payload);
  if (breakdownSamples.length > MAX_PROFILE_SAMPLES) {
    breakdownSamples.shift();
  }

  logPerformanceEvent("playback_startup_breakdown", payload);

  activeProfile = null;
}

export function finalizePlaybackStartupProfile(reason = "manual") {
  if (!activeProfile) return;

  const profile = activeProfile;
  profile.loggedBreakdown = true;

  const payload = buildBreakdownPayload(profile, reason);
  lastBreakdown = payload;

  breakdownSamples.push(payload);
  if (breakdownSamples.length > MAX_PROFILE_SAMPLES) {
    breakdownSamples.shift();
  }

  logPerformanceEvent("playback_startup_breakdown", payload);

  activeProfile = null;
}

export function getLastPlaybackStartupBreakdown() {
  return lastBreakdown;
}

export function getPlaybackStartupBreakdownDiagnostics() {
  const last = lastBreakdown || {};

  return {
    lastTapQueueMs: Number(last.queue_prepare_ms || 0),
    lastTapStateMs: Number(last.state_commit_before_audio_ms || 0),
    lastTapUnloadMs: Number(last.unload_previous_sound_ms || 0),
    lastTapCreateMs: Number(last.audio_object_create_ms || 0),
    lastTapPlayAsyncMs: Number(last.play_async_ms || 0),
    lastTapFirstPlayingMs: Number(last.first_status_playing_ms || 0),
    lastTapFirstPositionMs: Number(last.first_position_advance_ms || 0),
    lastTapSourceResolveMs: Number(last.source_resolution_ms || 0),
    lastTapAudioModeMs: Number(last.audio_mode_ms || 0),
    lastTapSideEffectsMs: Number(last.side_effects_after_playback_ms || 0),
    lastAudioUrlHost: String(last.audioUrlHost || "—"),
    lastPlaybackSourceType: String(last.playbackSourceType || "—"),
    lastUsedPreloadedSound: Boolean(last.usedPreloadedSound),
    lastSkippedSameTrackReload: Boolean(last.skippedSameTrackReload),
    lastBreakdownReason: String(last.reason || "—"),
    breakdownSampleCount: breakdownSamples.length,
  };
}

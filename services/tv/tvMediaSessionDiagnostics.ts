/**
 * Dev-only TV Now Playing / media-session diagnostics for one correlated playback attempt.
 * No timers, no listeners, no ownership/playback side effects.
 * Never logs stream URLs or signed tokens.
 *
 * Prefix: [HTTVNowPlayingDiag]
 */

import {
  getActivePlaybackContentKind,
  getActivePlaybackOwner,
} from "../playback/PlaybackHandoffCoordinator";

function safeAppState(): string {
  try {
    // Lazy require so Node contract tests (no RN runtime) still load this module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppState } = require("react-native") as {
      AppState?: { currentState?: string };
    };
    return String(AppState?.currentState || "unknown");
  } catch {
    return "node";
  }
}

export type TvMediaSessionDiagEvent =
  | "tv_playback_requested"
  | "media_owner_claim_requested"
  | "previous_media_owner_released"
  | "tv_media_owner_claimed"
  | "tv_native_player_ready"
  | "tv_metadata_created"
  | "publish_now_playing_invoked"
  | "native_bridge_method_checked"
  | "native_bridge_invoked"
  | "native_bridge_result"
  | "active_media_owner_after_publish"
  | "metadata_clear_invoked"
  | "media_owner_changed"
  | "tv_session_released"
  | "app_entered_background"
  | "app_returned_foreground"
  | "competing_metadata_publication_detected"
  | "remote_command_routed"
  // Legacy aliases kept for existing call sites.
  | "tv_owner_claimed"
  | "tv_metadata_published"
  | "tv_playback_state_update"
  | "tv_remote_play_received"
  | "tv_remote_pause_received"
  | "tv_remote_next_received"
  | "tv_remote_previous_received"
  | "tv_remote_stop_received"
  | "tv_owner_released"
  | "tv_metadata_replaced_by_other";

let activeCorrelationId: string | null = null;
let lastLoggedOwner: string | null = null;

function newCorrelationId() {
  return `tvms-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)
    .toString(36)
    .padStart(4, "0")}`;
}

/** Start a one-playback diagnostic session. Returns the correlation id. */
export function beginTvMediaSessionTrace(details?: Record<string, unknown>) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return "";
  activeCorrelationId = newCorrelationId();
  lastLoggedOwner = getActivePlaybackOwner();
  logTvMediaSessionDiag("tv_playback_requested", {
    ...details,
    previousOwner: lastLoggedOwner,
  });
  return activeCorrelationId;
}

export function getTvMediaSessionCorrelationId() {
  return activeCorrelationId;
}

export function endTvMediaSessionTrace(reason?: string) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  if (!activeCorrelationId) return;
  logTvMediaSessionDiag("tv_session_released", { reason: reason || "end_trace" });
  activeCorrelationId = null;
}

export function summarizeTvMetadataForDiag(meta: {
  id?: string;
  mediaType?: string;
  title?: string;
  artist?: string;
  artworkUri?: string;
  durationMillis?: number;
  isLive?: boolean;
  canSeek?: boolean;
}) {
  return {
    title: String(meta.title || "").slice(0, 80),
    artist: String(meta.artist || "").slice(0, 80),
    mediaType: String(meta.mediaType || "tv"),
    artworkPresent: Boolean(String(meta.artworkUri || "").trim()),
    durationKnown: Number(meta.durationMillis || 0) > 0,
    live: meta.isLive === true,
    canSeek: meta.canSeek === true,
    mediaIdentifier: String(meta.id || "").slice(0, 64),
  };
}

/**
 * Emit a media_owner_changed event only when the active owner actually differs
 * from the last logged owner for this trace.
 */
export function noteTvMediaOwnerIfChanged(reason?: string) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  const owner = getActivePlaybackOwner();
  if (owner === lastLoggedOwner) return;
  const previous = lastLoggedOwner;
  lastLoggedOwner = owner;
  logTvMediaSessionDiag("media_owner_changed", {
    previousOwner: previous,
    currentOwner: owner,
    reason: reason || "owner_changed",
  });
}

export function logTvMediaSessionDiag(
  event: TvMediaSessionDiagEvent,
  details?: Record<string, unknown>
): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log("[HTTVNowPlayingDiag]", event, {
    correlationId: activeCorrelationId,
    currentOwner: getActivePlaybackOwner(),
    contentKind: getActivePlaybackContentKind(),
    appState: safeAppState(),
    ...details,
    ts: Date.now(),
  });
}

/**
 * Global single-owner media handoff.
 *
 * Arbitration only — does not replace HiddenAudio, PlayerContext, TV, or Sports engines.
 * Last deliberate user tap wins via monotonic generation + AbortSignal.
 */

export type PlaybackOwnerId = "shared-audio" | "tv" | "video" | "sports";

export type PlaybackContentKind =
  | "music"
  | "radio"
  | "podcast"
  | "audiobook"
  | "lecture"
  | "motivational"
  | "tv"
  | "video"
  | "sports"
  | "live-concert";

export type PlaybackStopReason =
  | "owner_transfer"
  | "user_tap"
  | "stale_request"
  | "session_end"
  | "error";

export interface PlaybackOwnerAdapter {
  id: PlaybackOwnerId;
  /** Immediate silence / unload for this owner. Must be safe to call repeatedly. */
  stopImmediately: (reason: PlaybackStopReason) => void | Promise<void>;
  cancelPendingStart?: () => void;
  isActive?: () => boolean;
  clearPresentedState?: () => void;
}

export type PlaybackStartRequest = {
  owner: PlaybackOwnerId;
  contentKind: PlaybackContentKind;
  mediaKey: string;
  start: (context: {
    signal: AbortSignal;
    generation: number;
    isCurrent: () => boolean;
  }) => Promise<void>;
};

export type PlaybackClaim = {
  owner: PlaybackOwnerId;
  contentKind: PlaybackContentKind;
  mediaKey: string;
  generation: number;
  signal: AbortSignal;
  isCurrent: () => boolean;
};

type HandoffState = {
  generation: number;
  activeOwner: PlaybackOwnerId | null;
  contentKind: PlaybackContentKind | null;
  mediaKey: string | null;
  pendingController: AbortController | null;
};

const adapters = new Map<PlaybackOwnerId, PlaybackOwnerAdapter>();

let state: HandoffState = {
  generation: 0,
  activeOwner: null,
  contentKind: null,
  mediaKey: null,
  pendingController: null,
};

export function isPlaybackHandoffAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = String((error as { name?: string }).name || "");
  if (name === "AbortError") return true;
  const message = String((error as { message?: string }).message || "");
  return /aborted|AbortError|stale/i.test(message);
}

export function registerPlaybackOwnerAdapter(adapter: PlaybackOwnerAdapter) {
  adapters.set(adapter.id, adapter);
  return () => {
    const current = adapters.get(adapter.id);
    if (current === adapter) {
      adapters.delete(adapter.id);
    }
  };
}

export function getPlaybackOwnerAdapter(owner: PlaybackOwnerId) {
  return adapters.get(owner) ?? null;
}

export function getActivePlaybackOwner(): PlaybackOwnerId | null {
  return state.activeOwner;
}

export function getPlaybackHandoffGeneration(): number {
  return state.generation;
}

export function isPlaybackOwnerActive(owner: PlaybackOwnerId): boolean {
  return state.activeOwner === owner;
}

export function isPlaybackGenerationCurrent(generation: number): boolean {
  return state.generation === generation && !state.pendingController?.signal.aborted;
}

function abortPending() {
  const previous = state.pendingController;
  state.pendingController = null;
  if (!previous) return;
  try {
    previous.abort();
  } catch {
    // Ignore abort failures.
  }
}

async function stopOwner(
  owner: PlaybackOwnerId,
  reason: PlaybackStopReason,
  exceptOwner?: PlaybackOwnerId
) {
  if (exceptOwner && owner === exceptOwner) return;
  const adapter = adapters.get(owner);
  if (!adapter) return;
  try {
    adapter.cancelPendingStart?.();
  } catch {
    // Best-effort.
  }
  try {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[handoff] old_owner_stop_requested", {
        owner,
        reason,
        ts: Date.now(),
      });
    }
    await adapter.stopImmediately(reason);
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[handoff] old_owner_stop_resolved", {
        owner,
        reason,
        ts: Date.now(),
      });
    }
  } catch (error) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[handoff] old_owner_stop_rejected", {
        owner,
        reason,
        error: String((error as Error)?.message || error),
        ts: Date.now(),
      });
    }
    // Peer stop must never block the new owner.
  }
  try {
    adapter.clearPresentedState?.();
  } catch {
    // Best-effort.
  }
}

async function stopPeersImmediately(
  nextOwner: PlaybackOwnerId,
  reason: PlaybackStopReason
) {
  const peers: PlaybackOwnerId[] = ["shared-audio", "tv", "video", "sports"];
  // Prefer synchronous peer silence first — fire without awaiting each other.
  await Promise.all(
    peers
      .filter((owner) => owner !== nextOwner)
      .map((owner) => stopOwner(owner, reason, nextOwner))
  );
}

/**
 * Immediate ownership transfer for a deliberate user tap.
 * Stops every other registered owner before returning.
 */
export async function claimExclusivePlayback(input: {
  owner: PlaybackOwnerId;
  contentKind: PlaybackContentKind;
  mediaKey: string;
}): Promise<PlaybackClaim> {
  const previousOwner = state.activeOwner;
  const myGeneration = state.generation + 1;
  state.generation = myGeneration;

  abortPending();

  const controller = new AbortController();
  state.pendingController = controller;
  state.activeOwner = input.owner;
  state.contentKind = input.contentKind;
  state.mediaKey = input.mediaKey;

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[handoff] handoff_requested", {
      from: previousOwner,
      to: input.owner,
      contentKind: input.contentKind,
      mediaKey: input.mediaKey,
      generation: myGeneration,
      ts: Date.now(),
    });
  }

  await stopPeersImmediately(input.owner, "owner_transfer");

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[handoff] new_owner_activated", {
      owner: input.owner,
      contentKind: input.contentKind,
      generation: myGeneration,
      ts: Date.now(),
    });
  }

  const isCurrent = () =>
    state.generation === myGeneration &&
    !controller.signal.aborted &&
    state.activeOwner === input.owner;

  return {
    owner: input.owner,
    contentKind: input.contentKind,
    mediaKey: input.mediaKey,
    generation: myGeneration,
    signal: controller.signal,
    isCurrent,
  };
}

/**
 * Full request API — claim, then run async resolve/start under generation guard.
 */
export async function requestPlayback(request: PlaybackStartRequest): Promise<void> {
  const claim = await claimExclusivePlayback({
    owner: request.owner,
    contentKind: request.contentKind,
    mediaKey: request.mediaKey,
  });

  try {
    await request.start({
      signal: claim.signal,
      generation: claim.generation,
      isCurrent: claim.isCurrent,
    });

    // If a newer tap already won, do not stop peers again — that would kill the winner.
    if (!claim.isCurrent()) {
      return;
    }
  } catch (error) {
    if (isPlaybackHandoffAbortError(error) || !claim.isCurrent()) {
      return;
    }
    throw error;
  }
}

/** Soft release when an owner ends without transferring (stop button). */
export function releasePlaybackOwner(owner: PlaybackOwnerId, generation?: number) {
  if (state.activeOwner !== owner) return;
  if (typeof generation === "number" && state.generation !== generation) return;
  state.activeOwner = null;
  state.contentKind = null;
  state.mediaKey = null;
}

/** Test / recovery helper — does not stop adapters. */
export function __resetPlaybackHandoffForTests() {
  abortPending();
  adapters.clear();
  state = {
    generation: 0,
    activeOwner: null,
    contentKind: null,
    mediaKey: null,
    pendingController: null,
  };
}

export function __getPlaybackHandoffDebugState() {
  return {
    generation: state.generation,
    activeOwner: state.activeOwner,
    contentKind: state.contentKind,
    mediaKey: state.mediaKey,
    adapterIds: Array.from(adapters.keys()),
  };
}

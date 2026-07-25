/**
 * Immediate vs deferred queue windows for tap-to-play.
 * Large full-catalog queues must not block HiddenAudio.loadTrack.
 */

export const PLAYBACK_QUEUE_IMMEDIATE_LIMIT = 48;
/** Keep a small ahead window so Next works before deferred expansion. */
export const PLAYBACK_QUEUE_BOOTSTRAP_AHEAD = 15;
export const PLAYBACK_QUEUE_BOOTSTRAP_BEHIND = 1;

export type PlaybackQueueBootstrapResult<T> = {
  /** Queue used for immediate play + setState. */
  immediateQueue: T[];
  /** Index of the tapped item inside immediateQueue. */
  immediateIndex: number;
  /** True when a full queue must be applied after first audio. */
  shouldDeferFullQueue: boolean;
  /** Original absolute index in the full provided queue. */
  fullIndex: number;
};

function clampIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(index), length - 1));
}

/**
 * Build a bounded window around the tapped item for the critical play path.
 * Full provided queues (e.g. Home full_catalog ~1k+) expand after play starts.
 */
export function buildImmediatePlaybackQueueWindow<T>(options: {
  queue: T[];
  index: number;
  forceDefer?: boolean;
  immediateLimit?: number;
  ahead?: number;
  behind?: number;
}): PlaybackQueueBootstrapResult<T> {
  const queue = Array.isArray(options.queue) ? options.queue : [];
  const fullIndex = clampIndex(options.index, queue.length);
  const limit = options.immediateLimit ?? PLAYBACK_QUEUE_IMMEDIATE_LIMIT;
  const ahead = options.ahead ?? PLAYBACK_QUEUE_BOOTSTRAP_AHEAD;
  const behind = options.behind ?? PLAYBACK_QUEUE_BOOTSTRAP_BEHIND;
  const forceDefer = Boolean(options.forceDefer);

  if (!queue.length) {
    return {
      immediateQueue: [],
      immediateIndex: 0,
      shouldDeferFullQueue: false,
      fullIndex: 0,
    };
  }

  if (!forceDefer && queue.length <= limit) {
    return {
      immediateQueue: queue,
      immediateIndex: fullIndex,
      shouldDeferFullQueue: false,
      fullIndex,
    };
  }

  const start = Math.max(0, fullIndex - behind);
  const end = Math.min(queue.length, fullIndex + ahead + 1);
  const immediateQueue = queue.slice(start, end);
  const immediateIndex = clampIndex(fullIndex - start, immediateQueue.length);

  return {
    immediateQueue,
    immediateIndex,
    shouldDeferFullQueue: true,
    fullIndex,
  };
}

/** Pure ordering helper for tests: load must be scheduled before expand. */
export function assertLoadBeforeQueueExpand(events: string[]) {
  const loadIdx = events.indexOf("hidden_audio_load_start");
  const expandIdx = events.indexOf("deferred_full_queue_expand");
  if (loadIdx < 0) {
    throw new Error("missing hidden_audio_load_start");
  }
  if (expandIdx >= 0 && expandIdx < loadIdx) {
    throw new Error("queue expand ran before native load");
  }
  return true;
}

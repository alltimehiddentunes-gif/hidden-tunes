import { logPerformanceEvent } from "./performanceLogs";

type QueueKey = "activeQueue" | "youtubeQueue" | "radioQueue";

const progressUpdateCount = { value: 0 };
const progressUpdatesPerMinute = { value: 0 };
let progressWindowStartedAt = Date.now();
const playbackSubscriberRenders = new Map<string, number>();
const queueInvalidationWarnings = { value: 0 };
const queueReferenceChanges = new Map<QueueKey, number>();

function shouldTrack() {
  return typeof __DEV__ === "undefined" || __DEV__;
}

export function areSongQueuesEqual(
  left: { id?: string }[],
  right: { id?: string }[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (String(left[index]?.id) !== String(right[index]?.id)) {
      return false;
    }
  }

  return true;
}

export function recordPlaybackProgressUpdate() {
  if (!shouldTrack()) return;

  const now = Date.now();
  progressUpdateCount.value += 1;

  if (now - progressWindowStartedAt >= 60_000) {
    progressUpdatesPerMinute.value = progressUpdateCount.value;
    progressUpdateCount.value = 0;
    progressWindowStartedAt = now;
  }
}

export function trackPlaybackSubscriberRender(subscriber: string) {
  if (!shouldTrack()) return;

  playbackSubscriberRenders.set(
    subscriber,
    (playbackSubscriberRenders.get(subscriber) || 0) + 1
  );
}

export function recordQueueReferenceChange(queueKey: QueueKey, changed: boolean) {
  if (!shouldTrack() || !changed) return;

  queueReferenceChanges.set(
    queueKey,
    (queueReferenceChanges.get(queueKey) || 0) + 1
  );
  queueInvalidationWarnings.value += 1;

  logPerformanceEvent("queue_invalidation", {
    queue: queueKey,
    totalWarnings: queueInvalidationWarnings.value,
  });
}

export function resetPlaybackRenderDiagnostics() {
  progressUpdateCount.value = 0;
  progressUpdatesPerMinute.value = 0;
  progressWindowStartedAt = Date.now();
  playbackSubscriberRenders.clear();
  queueInvalidationWarnings.value = 0;
  queueReferenceChanges.clear();
}

export function getPlaybackRenderDiagnostics() {
  const subscriberRenders = Object.fromEntries(playbackSubscriberRenders.entries());
  const totalSubscriberRenders = Object.values(subscriberRenders).reduce(
    (total, count) => total + count,
    0
  );
  const queueChanges = Object.fromEntries(queueReferenceChanges.entries());

  return {
    progressUpdatesLastMinute: progressUpdatesPerMinute.value,
    progressUpdatesWindow: progressUpdateCount.value,
    playbackSubscriberRenders: subscriberRenders,
    totalPlaybackSubscriberRenders: totalSubscriberRenders,
    queueInvalidationWarnings: queueInvalidationWarnings.value,
    queueReferenceChanges: queueChanges,
  };
}

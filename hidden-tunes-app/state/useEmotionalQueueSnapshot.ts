import { useSyncExternalStore } from "react";

import {
  getEmotionalQueueSnapshot,
  subscribeEmotionalQueue,
} from "./emotionalQueueController";

export function useEmotionalQueueSnapshot() {
  return useSyncExternalStore(
    subscribeEmotionalQueue,
    getEmotionalQueueSnapshot,
    getEmotionalQueueSnapshot
  );
}

export function useEmotionalFlowActive() {
  const { emotionalQueue } = useEmotionalQueueSnapshot();
  return emotionalQueue.length > 1;
}

import { useEffect, useMemo, useState } from "react";

import { loadEmotionalFlowLongTermMemory } from "../state/emotionalFlowLongTermMemory";
import { loadEmotionalIdentity } from "../state/emotionalIdentity";
import { useEmotionalQueueSnapshot } from "../state/useEmotionalQueueSnapshot";
import {
  summarizeEmotionalEngine,
  type EmotionalEngineSummary,
} from "./summarizeEmotionalEngine";

export function useEmotionalEngineSummary(): EmotionalEngineSummary {
  const queueSnapshot = useEmotionalQueueSnapshot();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void Promise.all([
      loadEmotionalIdentity(),
      loadEmotionalFlowLongTermMemory(),
    ]).finally(() => {
      setHydrated(true);
    });
  }, []);

  return useMemo(() => {
    void hydrated;
    void queueSnapshot.emotionalQueue.length;
    void queueSnapshot.queueIndex;

    return summarizeEmotionalEngine();
  }, [
    hydrated,
    queueSnapshot.emotionalQueue.length,
    queueSnapshot.queueIndex,
  ]);
}

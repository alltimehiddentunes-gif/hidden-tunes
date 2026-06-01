import { useEffect, useMemo, useState } from "react";

import { loadEmotionalIdentity } from "../state/emotionalIdentity";
import { useEmotionalQueueSnapshot } from "../state/useEmotionalQueueSnapshot";
import { summarizeEmotionalIdentity } from "./summarizeEmotionalIdentity";

export function useEmotionalIdentitySummary() {
  const queueSnapshot = useEmotionalQueueSnapshot();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadEmotionalIdentity().finally(() => {
      setHydrated(true);
    });
  }, []);

  return useMemo(() => {
    void hydrated;
    void queueSnapshot.emotionalQueue.length;
    void queueSnapshot.queueIndex;

    return summarizeEmotionalIdentity();
  }, [
    hydrated,
    queueSnapshot.emotionalQueue.length,
    queueSnapshot.queueIndex,
  ]);
}

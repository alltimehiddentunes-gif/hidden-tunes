import { useEffect, useRef, useState } from "react";

import {
  getEmotionalQueueSnapshot,
  subscribeEmotionalQueue,
} from "../state/emotionalQueueController";

const PULSE_DURATION_MS = 600;

function buildQueueSignature() {
  const snapshot = getEmotionalQueueSnapshot();
  const trackIds = snapshot.emotionalQueue
    .map((track) => String(track.id))
    .join("|");

  return `${snapshot.queueIndex}:${trackIds}`;
}

export function useEmotionalPulse(): boolean {
  const [pulseActive, setPulseActive] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signatureRef = useRef(buildQueueSignature());
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    const clearPulseTimeout = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const triggerPulse = () => {
      setPulseActive(true);
      clearPulseTimeout();
      timeoutRef.current = setTimeout(() => {
        setPulseActive(false);
        timeoutRef.current = null;
      }, PULSE_DURATION_MS);
    };

    const unsubscribe = subscribeEmotionalQueue(() => {
      const nextSignature = buildQueueSignature();

      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        signatureRef.current = nextSignature;
        return;
      }

      if (nextSignature === signatureRef.current) {
        return;
      }

      signatureRef.current = nextSignature;

      const { emotionalQueue } = getEmotionalQueueSnapshot();
      if (!emotionalQueue.length) {
        return;
      }

      triggerPulse();
    });

    return () => {
      unsubscribe();
      clearPulseTimeout();
    };
  }, []);

  return pulseActive;
}

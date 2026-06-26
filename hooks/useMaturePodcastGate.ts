import { useCallback, useRef, useState } from "react";

import type { PodcastEpisode } from "../types/podcast";
import {
  enableMaturePodcastsWithConsent,
  shouldIncludeMaturePodcasts,
} from "../utils/maturePodcastSettings";
import { logPodcastDiagnostic } from "../utils/podcastDiagnostics";

type MaturePodcastGateState = {
  consentVisible: boolean;
  runWithMaturePodcastConsent: (
    episode: PodcastEpisode | null | undefined,
    action: () => void
  ) => void;
  cancelConsent: () => void;
  confirmConsent: () => void;
};

export function useMaturePodcastGate(): MaturePodcastGateState {
  const [consentVisible, setConsentVisible] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const runWithMaturePodcastConsent = useCallback(
    (episode: PodcastEpisode | null | undefined, action: () => void) => {
      const isMature = episode?.matureLevel && episode.matureLevel !== "safe";
      if (!isMature) {
        action();
        return;
      }

      if (shouldIncludeMaturePodcasts()) {
        action();
        return;
      }

      logPodcastDiagnostic("mature_podcast_blocked", {
        episodeId: episode?.id,
        showId: episode?.showId,
      });
      pendingActionRef.current = action;
      setConsentVisible(true);
    },
    []
  );

  const cancelConsent = useCallback(() => {
    pendingActionRef.current = null;
    setConsentVisible(false);
  }, []);

  const confirmConsent = useCallback(() => {
    void enableMaturePodcastsWithConsent().then(() => {
      setConsentVisible(false);
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      action?.();
    });
  }, []);

  return {
    consentVisible,
    runWithMaturePodcastConsent,
    cancelConsent,
    confirmConsent,
  };
}

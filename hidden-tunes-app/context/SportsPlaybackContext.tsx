/**
 * Isolated Sports playback session owner.
 * Intentionally does NOT import or mutate PlayerContext, TV session, MiniPlayer, or music queue.
 * Feature-flagged — not mounted in app/_layout until Phase 2 approval.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { isSportsClientEnabled } from "../constants/sportsFlags";
import { resolveSportsPlayback } from "../services/sports/sportsPlaybackResolver";
import {
  recordSportsWatchHistory,
  upsertSportsContinueWatching,
} from "../services/sports/sportsWatchHistory";
import type { SportsPlaybackResult } from "../types/sports";

type SportsSession = {
  broadcastId: string;
  title: string;
  playback: SportsPlaybackResult;
};

type SportsPlaybackContextValue = {
  enabled: boolean;
  session: SportsSession | null;
  error: string | null;
  startBroadcast: (input: {
    broadcastId: string;
    title: string;
    platform: "ios" | "android" | "desktop" | "web" | "smart_tv";
    country: string;
  }) => Promise<boolean>;
  stop: () => void;
};

const SportsPlaybackContext = createContext<SportsPlaybackContextValue | null>(
  null
);

export function SportsPlaybackProvider({ children }: { children: ReactNode }) {
  const enabled = isSportsClientEnabled("sports_enabled");
  const [session, setSession] = useState<SportsSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSession(null);
    setError(null);
  }, []);

  const startBroadcast = useCallback(
    async (input: {
      broadcastId: string;
      title: string;
      platform: "ios" | "android" | "desktop" | "web" | "smart_tv";
      country: string;
    }) => {
      if (!enabled) {
        setError("Sports is disabled.");
        return false;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);

      const result = await resolveSportsPlayback({
        broadcastId: input.broadcastId,
        platform: input.platform,
        country: input.country,
        signal: controller.signal,
      });

      if (controller.signal.aborted) return false;

      if (!result.ok) {
        setError(result.message);
        setSession(null);
        return false;
      }

      const next: SportsSession = {
        broadcastId: input.broadcastId,
        title: input.title,
        playback: result.playback,
      };
      setSession(next);
      await recordSportsWatchHistory({
        id: input.broadcastId,
        kind: "broadcast",
        title: input.title,
        positionMs: 0,
      });
      await upsertSportsContinueWatching({
        id: input.broadcastId,
        kind: "broadcast",
        title: input.title,
        positionMs: 0,
      });
      return true;
    },
    [enabled]
  );

  const value = useMemo(
    () => ({ enabled, session, error, startBroadcast, stop }),
    [enabled, session, error, startBroadcast, stop]
  );

  return (
    <SportsPlaybackContext.Provider value={value}>
      {children}
    </SportsPlaybackContext.Provider>
  );
}

export function useSportsPlayback() {
  const ctx = useContext(SportsPlaybackContext);
  if (!ctx) {
    throw new Error("useSportsPlayback must be used within SportsPlaybackProvider");
  }
  return ctx;
}

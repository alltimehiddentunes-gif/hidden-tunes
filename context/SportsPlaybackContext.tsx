/**
 * Compatibility Sports playback context.
 * Active fixture playback is owned exclusively by `app/sports/player/[fixtureId].tsx`.
 * This provider keeps the public API for home wrappers but does not resolve streams,
 * register the Sports handoff adapter, or compete with the player route.
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
    async (_input: {
      broadcastId: string;
      title: string;
      platform: "ios" | "android" | "desktop" | "web" | "smart_tv";
      country: string;
    }) => {
      // Compatibility stub — player route owns resolve + handoff.
      if (!enabled) {
        setError("Sports is disabled.");
        return false;
      }
      setError(
        "Open this match from the Sports player. In-app playback is owned by the Sports player route."
      );
      setSession(null);
      return false;
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PodcastEpisode } from "../types/podcast";
import { loadPodcastRecentlyPlayed } from "../services/podcastRecentlyPlayed";

type PodcastHomeState = {
  recentlyPlayed: PodcastEpisode[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const EMPTY_HOME_STATE: Omit<PodcastHomeState, "refresh"> = {
  recentlyPlayed: [],
  loading: true,
  error: null,
};

async function loadRecentlyPlayedWithTimeout(limit: number, timeoutMs = 2000) {
  try {
    return await Promise.race([
      loadPodcastRecentlyPlayed(limit),
      new Promise<PodcastEpisode[]>((resolve) => {
        setTimeout(() => resolve([]), timeoutMs);
      }),
    ]);
  } catch {
    return [];
  }
}

export function usePodcastHome(): PodcastHomeState {
  const [state, setState] = useState<Omit<PodcastHomeState, "refresh">>(EMPTY_HOME_STATE);
  const mountedRef = useRef(false);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    const recent = await loadRecentlyPlayedWithTimeout(8);

    if (!mountedRef.current) {
      return;
    }

    setState({
      recentlyPlayed: recent,
      loading: false,
      error: null,
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const loadTimer = setTimeout(() => {
      void load();
    }, 0);
    return () => {
      mountedRef.current = false;
      clearTimeout(loadTimer);
    };
  }, [load]);

  return useMemo(() => ({ ...state, refresh: load }), [load, state]);
}

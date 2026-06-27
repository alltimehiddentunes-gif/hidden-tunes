import { useEffect, useRef, useState, useCallback } from "react";

import { searchPodcasts } from "../services/podcastService";
import type { PodcastSearchResult } from "../types/podcast";
import { shouldIncludeMaturePodcasts } from "../utils/maturePodcastSettings";
import { useMountedRef } from "./useMountedRef";
import { SEARCH_MEDIA_DEFER_MS } from "../utils/searchPerformance";

type DeferredPodcastSearchState = {
  results: PodcastSearchResult[];
  loading: boolean;
  readyForQuery: string;
  query: string;
};

const EMPTY: DeferredPodcastSearchState = {
  results: [],
  loading: false,
  readyForQuery: "",
  query: "",
};

export function useDeferredSearchPodcastSections(submittedQuery: string) {
  const [state, setState] = useState<DeferredPodcastSearchState>(EMPTY);
  const generationRef = useRef(0);
  const mountedRef = useMountedRef();

  const safeSet = useCallback(
    (updater: (current: DeferredPodcastSearchState) => DeferredPodcastSearchState) => {
      if (!mountedRef.current) return;
      setState(updater);
    },
    [mountedRef]
  );

  useEffect(() => {
    const query = submittedQuery.trim();
    if (query.length < 2) {
      generationRef.current += 1;
      safeSet(() => EMPTY);
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;

    safeSet(() => ({ ...EMPTY, loading: true, query }));

    const timer = setTimeout(() => {
      if (generationRef.current !== generation || !mountedRef.current) return;

      try {
        const results = searchPodcasts(query, {
          includeMature: shouldIncludeMaturePodcasts(),
          limit: 12,
        });
        if (generationRef.current !== generation || !mountedRef.current) return;
        safeSet(() => ({
          results,
          loading: false,
          readyForQuery: query,
          query,
        }));
      } catch {
        if (generationRef.current !== generation || !mountedRef.current) return;
        safeSet(() => ({
          results: [],
          loading: false,
          readyForQuery: query,
          query,
        }));
      }
    }, SEARCH_MEDIA_DEFER_MS);

    return () => clearTimeout(timer);
  }, [submittedQuery, safeSet]);

  return state;
}

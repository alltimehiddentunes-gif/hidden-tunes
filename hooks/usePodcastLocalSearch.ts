import { useEffect, useMemo, useState } from "react";

import { searchPodcasts } from "../services/podcastService";
import type { PodcastSearchResult } from "../types/podcast";
import { shouldIncludeMaturePodcasts } from "../utils/maturePodcastSettings";

type UsePodcastLocalSearchOptions = {
  matureOnly?: boolean;
  categoryIds?: string[];
  limit?: number;
};

export function usePodcastLocalSearch(options?: UsePodcastLocalSearchOptions) {
  const [query, setQuery] = useState("");
  const [deferredQuery, setDeferredQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDeferredQuery(query);
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    const trimmed = deferredQuery.trim();
    if (trimmed.length < 2) return [] as PodcastSearchResult[];

    const matureOnly = options?.matureOnly ?? false;
    if (matureOnly && !shouldIncludeMaturePodcasts()) {
      return [] as PodcastSearchResult[];
    }

    return searchPodcasts(trimmed, {
      includeMature: matureOnly ? true : shouldIncludeMaturePodcasts(),
      matureOnly,
      categoryIds: options?.categoryIds,
      limit: options?.limit ?? 20,
    });
  }, [deferredQuery, options?.categoryIds, options?.limit, options?.matureOnly]);

  return {
    query,
    setQuery,
    results,
    hasQuery: query.trim().length >= 2,
  };
}

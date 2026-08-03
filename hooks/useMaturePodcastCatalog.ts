import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  catalogShowToPodcastShow,
  fetchMaturePodcastShows,
  PODCAST_CATALOG_PAGE_LIMIT,
} from "../services/podcastCatalogApi";
import type { PodcastShow } from "../types/podcast";
import { shouldIncludeMaturePodcasts } from "../utils/maturePodcastSettings";

type MatureCatalogState = {
  shows: PodcastShow[];
  page: number;
  hasMore: boolean;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  refresh: () => void;
  loadMore: () => void;
  cancel: () => void;
};

function dedupeShows(existing: PodcastShow[], incoming: PodcastShow[]) {
  const seen = new Set(existing.map((show) => show.id));
  const next = [...existing];
  for (const show of incoming) {
    if (!show.id || seen.has(show.id)) continue;
    seen.add(show.id);
    next.push(show);
  }
  return next;
}

export function useMaturePodcastCatalog(options?: {
  enabled?: boolean;
  query?: string;
}): MatureCatalogState {
  const enabled = options?.enabled ?? shouldIncludeMaturePodcasts();
  const query = String(options?.query || "").trim();
  const hasSearch = query.length >= 2;

  const [shows, setShows] = useState<PodcastShow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const inflightPageRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const loadPage = useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (!enabled) {
        setShows([]);
        setPage(1);
        setHasMore(false);
        setTotal(0);
        setLoading(false);
        setLoadingMore(false);
        setError(null);
        return;
      }

      if (inflightPageRef.current === nextPage) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      inflightPageRef.current = nextPage;

      if (mode === "replace") {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        const response = await fetchMaturePodcastShows({
          page: nextPage,
          limit: PODCAST_CATALOG_PAGE_LIMIT,
          q: hasSearch ? query : undefined,
          signal: controller.signal,
        });

        if (!mountedRef.current || controller.signal.aborted) return;

        if (!response.success) {
          if (response.error === "Aborted") return;
          setError(response.error || "Mature podcasts could not be loaded.");
          if (mode === "replace") {
            setShows([]);
            setHasMore(false);
            setTotal(0);
          }
          return;
        }

        const mapped = response.shows.map((show) =>
          catalogShowToPodcastShow(show, "adult")
        );

        setShows((current) =>
          mode === "append" ? dedupeShows(current, mapped) : dedupeShows([], mapped)
        );
        setPage(response.pagination.page);
        setHasMore(Boolean(response.pagination.hasMore));
        setTotal(Number(response.pagination.total) || mapped.length);
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Mature podcasts could not be loaded.");
        if (mode === "replace") {
          setShows([]);
          setHasMore(false);
          setTotal(0);
        }
      } finally {
        if (inflightPageRef.current === nextPage) {
          inflightPageRef.current = null;
        }
        if (mountedRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [enabled, hasSearch, query]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      inflightPageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPage(1, "replace");
    }, 0);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
      inflightPageRef.current = null;
    };
  }, [loadPage]);

  const refresh = useCallback(() => {
    void loadPage(1, "replace");
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMore || !hasMore) return;
    void loadPage(page + 1, "append");
  }, [enabled, hasMore, loadPage, loading, loadingMore, page]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    inflightPageRef.current = null;
  }, []);

  return useMemo(
    () => ({
      shows,
      page,
      hasMore,
      total,
      loading,
      loadingMore,
      error,
      refresh,
      loadMore,
      cancel,
    }),
    [cancel, error, hasMore, loadMore, loading, loadingMore, page, refresh, shows, total]
  );
}

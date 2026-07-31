/**

 * Bounded Sports TV catalog — reuses canonical TV APIs + playability gate.

 * Never downloads the full TV catalog; page/limit only under category=Sports.

 * Retains loaded pages on refresh/error; caps in-memory page accumulation.

 */

import { useCallback, useEffect, useRef, useState } from "react";



import { isSportsClientEnabled } from "@/constants/sportsFlags";

import {

  SPORTS_TV_CATEGORY,

  SPORTS_TV_MAX_PAGES_IN_MEMORY,

  SPORTS_TV_PAGE_LIMIT,

} from "@/lib/sports/sportsTvConstants";

import {

  fetchTvCatalog,

  type HiddenTunesTvVideo,

} from "@/services/tvCatalogApi";



export { SPORTS_TV_CATEGORY, SPORTS_TV_PAGE_LIMIT };



export type SportsTvCatalogState = {

  videos: HiddenTunesTvVideo[];

  loading: boolean;

  loadingMore: boolean;

  error: string | null;

  hasMore: boolean;

  total: number | null;

  enabled: boolean;

  refresh: () => void;

  loadMore: () => void;

};



function mergeUniqueVideos(

  prev: HiddenTunesTvVideo[],

  next: HiddenTunesTvVideo[]

): HiddenTunesTvVideo[] {

  const seen = new Set(prev.map((v) => v.id));

  const merged = [...prev];

  for (const v of next) {

    if (!v?.id || seen.has(v.id)) continue;

    seen.add(v.id);

    merged.push(v);

  }

  return merged;

}



function capVideos(

  videos: HiddenTunesTvVideo[],

  limit: number,

  maxPages: number

): HiddenTunesTvVideo[] {

  const maxItems = Math.max(limit, limit * maxPages);

  if (videos.length <= maxItems) return videos;

  return videos.slice(videos.length - maxItems);

}



export function useSportsTvCatalog(options?: {

  enabled?: boolean;

  limit?: number;

}): SportsTvCatalogState {

  const flagOn = isSportsClientEnabled("sports_tv_enabled");

  const enabled = options?.enabled !== false && flagOn;

  const limit = Math.min(50, Math.max(1, options?.limit ?? SPORTS_TV_PAGE_LIMIT));



  const [videos, setVideos] = useState<HiddenTunesTvVideo[]>([]);

  const [loading, setLoading] = useState(false);

  const [loadingMore, setLoadingMore] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [hasMore, setHasMore] = useState(false);

  const [total, setTotal] = useState<number | null>(null);

  const [page, setPage] = useState(1);



  const abortRef = useRef<AbortController | null>(null);

  const inFlightRef = useRef(false);

  const inFlightPageRef = useRef<number | null>(null);

  const mountedRef = useRef(true);

  const videosRef = useRef<HiddenTunesTvVideo[]>([]);

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  const fetchPage = useCallback(

    async (pageNum: number, mode: "replace" | "append") => {

      if (!enabled) {

        setVideos([]);

        setHasMore(false);

        setTotal(null);

        setError(null);

        setLoading(false);

        setLoadingMore(false);

        return;

      }

      if (inFlightRef.current) {

        // Dedupe identical page requests; allow replace to abort append.

        if (mode === "append") return;

        if (inFlightPageRef.current === pageNum && mode === "replace") return;

      }

      inFlightRef.current = true;

      inFlightPageRef.current = pageNum;

      abortRef.current?.abort();

      const controller = new AbortController();

      abortRef.current = controller;



      const hadContent = videosRef.current.length > 0;

      if (mode === "replace") {

        // Soft refresh: keep shelf visible; full spinner only with no data.

        if (!hadContent) setLoading(true);

        setError(null);

      } else {

        setLoadingMore(true);

      }



      try {

        const res = await fetchTvCatalog(

          { category: SPORTS_TV_CATEGORY, page: pageNum, limit },

          { signal: controller.signal }

        );

        if (controller.signal.aborted || !mountedRef.current) return;



        // Aborted/failed empty success must not wipe a loaded shelf.

        if (res.error === "aborted") return;

        if (!res.success && !res.videos?.length) {

          setError("Sports TV channels could not be loaded.");

          return;

        }



        const next = Array.isArray(res.videos) ? res.videos : [];

        setVideos((prev) => {

          if (mode === "replace") return next;

          return capVideos(

            mergeUniqueVideos(prev, next),

            limit,

            SPORTS_TV_MAX_PAGES_IN_MEMORY

          );

        });

        setPage(pageNum);

        setHasMore(Boolean(res.pagination?.hasMore));

        setTotal(

          typeof res.pagination?.total === "number" ? res.pagination.total : null

        );

        setError(null);

      } catch {

        if (!controller.signal.aborted && mountedRef.current) {

          setError("Sports TV channels could not be loaded.");

          // Keep previously loaded pages — never poison to [].

        }

      } finally {

        if (inFlightPageRef.current === pageNum) {

          inFlightRef.current = false;

          inFlightPageRef.current = null;

        }

        if (!controller.signal.aborted && mountedRef.current) {

          setLoading(false);

          setLoadingMore(false);

        }

      }

    },

    [enabled, limit]

  );



  useEffect(() => {
    mountedRef.current = true;
    const timer = setTimeout(() => {
      void fetchPage(1, "replace");
    }, 0);

    return () => {
      clearTimeout(timer);
      mountedRef.current = false;
      abortRef.current?.abort();
      inFlightRef.current = false;
      inFlightPageRef.current = null;
    };
  }, [fetchPage]);



  const refresh = useCallback(() => {

    void fetchPage(1, "replace");

  }, [fetchPage]);



  const loadMore = useCallback(() => {

    if (!enabled || !hasMore || loading || loadingMore) return;

    if (inFlightRef.current) return;

    const nextPage = page + 1;

    if (nextPage > SPORTS_TV_MAX_PAGES_IN_MEMORY && videos.length >= limit * SPORTS_TV_MAX_PAGES_IN_MEMORY) {

      // Still allow paging, but memory is capped by slicing oldest pages out.

    }

    void fetchPage(nextPage, "append");

  }, [enabled, hasMore, loading, loadingMore, page, fetchPage, videos.length, limit]);



  return {

    videos,

    loading,

    loadingMore,

    error,

    hasMore,

    total,

    enabled,

    refresh,

    loadMore,

  };

}



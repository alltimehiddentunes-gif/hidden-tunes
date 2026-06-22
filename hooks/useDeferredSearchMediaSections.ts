import { useEffect, useRef, useState, useCallback } from "react";

import { MEDIA_DISCOVERY_PAGE_SIZE } from "../constants/mediaDiscovery";
import type { HiddenTunesPodcastShow } from "../services/podcastCatalogApi";
import { loadPodcastSearchPage } from "../services/podcastDiscoveryApi";
import { loadRadioSearchPage } from "../services/radio/radioBrowserApi";
import { toRadioStationListItem } from "../services/radio/radioNormalizer";
import type { HiddenTunesStation, RadioStationListItem } from "../types/radio";
import { useMountedRef } from "./useMountedRef";
import {
  SEARCH_MEDIA_DEFER_MS,
  SEARCH_MEDIA_SECONDARY_DEFER_MS,
} from "../utils/searchPerformance";
import {
  logHeatRequestCancelled,
  logHeatRequestComplete,
  logHeatRequestStart,
  logHeatStaleResult,
} from "../utils/heatPerformanceDiagnostics";

type DeferredSearchMediaState = {
  podcastShows: HiddenTunesPodcastShow[];
  radioStations: RadioStationListItem[];
  podcastLoading: boolean;
  radioLoading: boolean;
  podcastQuery: string;
  radioQuery: string;
  podcastHasMore: boolean;
  radioHasMore: boolean;
};

const EMPTY_STATE: DeferredSearchMediaState = {
  podcastShows: [],
  radioStations: [],
  podcastLoading: false,
  radioLoading: false,
  podcastQuery: "",
  radioQuery: "",
  podcastHasMore: false,
  radioHasMore: false,
};

export function useDeferredSearchMediaSections(submittedQuery: string) {
  const [state, setState] = useState<DeferredSearchMediaState>(EMPTY_STATE);
  const requestGenerationRef = useRef(0);
  const stationStoreRef = useRef(new Map<string, HiddenTunesStation>());
  const mountedRef = useMountedRef();

  const safeSetState = useCallback(
    (updater: (current: DeferredSearchMediaState) => DeferredSearchMediaState) => {
      if (!mountedRef.current) return;
      setState(updater);
    },
    [mountedRef]
  );

  useEffect(() => {
    const query = submittedQuery.trim();

    if (query.length < 2) {
      requestGenerationRef.current += 1;
      stationStoreRef.current.clear();
      safeSetState(() => EMPTY_STATE);
      return;
    }

    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;

    safeSetState(() => ({
      ...EMPTY_STATE,
      podcastQuery: query,
      radioQuery: "",
    }));

    let radioTimer: ReturnType<typeof setTimeout> | null = null;

    const timer = setTimeout(() => {
      if (requestGenerationRef.current !== generation || !mountedRef.current) return;

      safeSetState((current) => ({
        ...current,
        podcastLoading: true,
        podcastQuery: query,
      }));

      void (async () => {
        const podcastStartedAt = Date.now();
        logHeatRequestStart("search:podcast", { query, generation });
        const podcastResult = await loadPodcastSearchPage(query, {
          offset: 0,
          forceRefresh: false,
        }).catch(() => ({ shows: [], hasMore: false }));

        if (requestGenerationRef.current !== generation || !mountedRef.current) {
          logHeatStaleResult("search:podcast", { query, generation });
          return;
        }

        logHeatRequestComplete("search:podcast", podcastStartedAt, {
          query,
          count: podcastResult.shows.length,
        });
        safeSetState((current) => ({
          ...current,
          podcastShows: podcastResult.shows.slice(0, MEDIA_DISCOVERY_PAGE_SIZE),
          podcastLoading: false,
          podcastQuery: query,
          podcastHasMore: podcastResult.hasMore,
          radioLoading: true,
        }));

        radioTimer = setTimeout(() => {
          void (async () => {
            const radioStartedAt = Date.now();
            logHeatRequestStart("search:radio", { query, generation });
            const radioResult = await loadRadioSearchPage(query, {
              offset: 0,
              limit: MEDIA_DISCOVERY_PAGE_SIZE,
              forceRefresh: false,
            }).catch(() => ({ stations: [], hasMore: false, fromCache: false }));

            if (requestGenerationRef.current !== generation || !mountedRef.current) {
              logHeatStaleResult("search:radio", { query, generation });
              return;
            }

            stationStoreRef.current.clear();
            radioResult.stations.slice(0, MEDIA_DISCOVERY_PAGE_SIZE).forEach((station) => {
              stationStoreRef.current.set(station.id, station);
            });

            logHeatRequestComplete("search:radio", radioStartedAt, {
              query,
              count: radioResult.stations.length,
            });
            safeSetState((current) => ({
              ...current,
              radioStations: radioResult.stations
                .slice(0, MEDIA_DISCOVERY_PAGE_SIZE)
                .map(toRadioStationListItem),
              radioLoading: false,
              radioQuery: query,
              radioHasMore: radioResult.hasMore,
            }));
          })();
        }, SEARCH_MEDIA_SECONDARY_DEFER_MS);
      })();
    }, SEARCH_MEDIA_DEFER_MS);

    return () => {
      clearTimeout(timer);
      if (radioTimer) clearTimeout(radioTimer);
      requestGenerationRef.current += 1;
      logHeatRequestCancelled("search:media", { query, generation });
    };
  }, [mountedRef, safeSetState, submittedQuery]);

  const trimmedSubmittedQuery = submittedQuery.trim();
  const podcastReadyForQuery =
    trimmedSubmittedQuery.length >= 2 && state.podcastQuery === trimmedSubmittedQuery;
  const radioReadyForQuery =
    trimmedSubmittedQuery.length >= 2 && state.radioQuery === trimmedSubmittedQuery;
  const mediaReadyForQuery = podcastReadyForQuery && radioReadyForQuery;

  const resolveRadioStation = useCallback(
    (stationId: string) => stationStoreRef.current.get(stationId) || null,
    []
  );

  return {
    ...state,
    mediaReadyForQuery,
    podcastReadyForQuery,
    radioReadyForQuery,
    maxSectionSize: MEDIA_DISCOVERY_PAGE_SIZE,
    resolveRadioStation,
  };
}

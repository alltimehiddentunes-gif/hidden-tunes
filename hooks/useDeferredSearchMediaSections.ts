import { useEffect, useRef, useState, useCallback } from "react";

import { MEDIA_DISCOVERY_PAGE_SIZE } from "../constants/mediaDiscovery";
import { loadRadioSearchPage } from "../services/radio/radioBrowserApi";
import { toRadioStationListItem } from "../services/radio/radioNormalizer";
import type { HiddenTunesStation, RadioStationListItem } from "../types/radio";
import { useMountedRef } from "./useMountedRef";
import { SEARCH_MEDIA_DEFER_MS } from "../utils/searchPerformance";
import {
  logHeatRequestCancelled,
  logHeatRequestComplete,
  logHeatRequestStart,
  logHeatStaleResult,
} from "../utils/heatPerformanceDiagnostics";
import { createDiscoveryScreenController } from "../utils/discoveryRequestManager";

type DeferredSearchMediaState = {
  radioStations: RadioStationListItem[];
  radioLoading: boolean;
  radioQuery: string;
  radioHasMore: boolean;
};

const EMPTY_STATE: DeferredSearchMediaState = {
  radioStations: [],
  radioLoading: false,
  radioQuery: "",
  radioHasMore: false,
};

export function useDeferredSearchMediaSections(submittedQuery: string) {
  const [state, setState] = useState<DeferredSearchMediaState>(EMPTY_STATE);
  const requestGenerationRef = useRef(0);
  const discoveryControllerRef = useRef(createDiscoveryScreenController("global-search-media"));
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
      discoveryControllerRef.current.bumpGeneration();
      stationStoreRef.current.clear();
      safeSetState(() => EMPTY_STATE);
      return;
    }

    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    discoveryControllerRef.current.bumpGeneration();

    safeSetState(() => ({
      ...EMPTY_STATE,
      radioQuery: "",
    }));

    const timer = setTimeout(() => {
      if (requestGenerationRef.current !== generation || !mountedRef.current) return;

      safeSetState((current) => ({
        ...current,
        radioLoading: true,
        radioQuery: query,
      }));

      void (async () => {
        const radioStartedAt = Date.now();
        logHeatRequestStart("search:radio", { query, generation });
        const radioResult =
          (await discoveryControllerRef.current.run(`search:radio:${query}`, () =>
            loadRadioSearchPage(query, {
              offset: 0,
              limit: MEDIA_DISCOVERY_PAGE_SIZE,
              forceRefresh: false,
              requestKey: `search:${query}`,
            }).catch(() => ({ stations: [], hasMore: false, fromCache: false }))
          )) || { stations: [], hasMore: false, fromCache: false };

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
    }, SEARCH_MEDIA_DEFER_MS);

    return () => {
      clearTimeout(timer);
      requestGenerationRef.current += 1;
      discoveryControllerRef.current.bumpGeneration();
      logHeatRequestCancelled("search:media", { query, generation });
    };
  }, [mountedRef, safeSetState, submittedQuery]);

  const trimmedSubmittedQuery = submittedQuery.trim();
  const radioReadyForQuery =
    trimmedSubmittedQuery.length >= 2 && state.radioQuery === trimmedSubmittedQuery;
  const mediaReadyForQuery = radioReadyForQuery;

  const resolveRadioStation = useCallback(
    (stationId: string) => stationStoreRef.current.get(stationId) || null,
    []
  );

  return {
    ...state,
    mediaReadyForQuery,
    radioReadyForQuery,
    maxSectionSize: MEDIA_DISCOVERY_PAGE_SIZE,
    resolveRadioStation,
  };
}

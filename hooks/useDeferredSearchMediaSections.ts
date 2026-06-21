import { useEffect, useRef, useState, useCallback } from "react";

import { MEDIA_DISCOVERY_PAGE_SIZE } from "../constants/mediaDiscovery";
import type { HiddenTunesPodcastShow } from "../services/podcastCatalogApi";
import { loadPodcastSearchPage } from "../services/podcastDiscoveryApi";
import { loadRadioSearchPage } from "../services/radio/radioBrowserApi";
import { toRadioStationListItem } from "../services/radio/radioNormalizer";
import type { HiddenTunesStation, RadioStationListItem } from "../types/radio";

const SEARCH_MEDIA_DEFER_MS = 480;

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

  useEffect(() => {
    const query = submittedQuery.trim();

    if (query.length < 2) {
      requestGenerationRef.current += 1;
      stationStoreRef.current.clear();
      setState(EMPTY_STATE);
      return;
    }

    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;

    setState((current) => ({
      ...EMPTY_STATE,
      podcastLoading: true,
      radioLoading: true,
      podcastQuery: query,
      radioQuery: query,
    }));

    const timer = setTimeout(() => {
      void (async () => {
        const podcastPromise = loadPodcastSearchPage(query, {
          offset: 0,
          forceRefresh: false,
        }).catch(() => ({ shows: [], hasMore: false }));

        const radioPromise = loadRadioSearchPage(query, {
          offset: 0,
          limit: MEDIA_DISCOVERY_PAGE_SIZE,
          forceRefresh: false,
        }).catch(() => ({ stations: [], hasMore: false, fromCache: false }));

        const [podcastResult, radioResult] = await Promise.all([
          podcastPromise,
          radioPromise,
        ]);

        if (requestGenerationRef.current !== generation) return;

        radioResult.stations.slice(0, MEDIA_DISCOVERY_PAGE_SIZE).forEach((station) => {
          stationStoreRef.current.set(station.id, station);
        });

        setState({
          podcastShows: podcastResult.shows.slice(0, MEDIA_DISCOVERY_PAGE_SIZE),
          radioStations: radioResult.stations
            .slice(0, MEDIA_DISCOVERY_PAGE_SIZE)
            .map(toRadioStationListItem),
          podcastLoading: false,
          radioLoading: false,
          podcastQuery: query,
          radioQuery: query,
          podcastHasMore: podcastResult.hasMore,
          radioHasMore: radioResult.hasMore,
        });
      })();
    }, SEARCH_MEDIA_DEFER_MS);

    return () => {
      clearTimeout(timer);
      requestGenerationRef.current += 1;
    };
  }, [submittedQuery]);

  const mediaReadyForQuery =
    submittedQuery.trim().length >= 2 &&
    state.podcastQuery === submittedQuery.trim() &&
    state.radioQuery === submittedQuery.trim();

  const resolveRadioStation = useCallback(
    (stationId: string) => stationStoreRef.current.get(stationId) || null,
    []
  );

  return {
    ...state,
    mediaReadyForQuery,
    maxSectionSize: MEDIA_DISCOVERY_PAGE_SIZE,
    resolveRadioStation,
  };
}

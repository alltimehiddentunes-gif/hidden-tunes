import { useCallback, useEffect, useRef, useState } from "react";

import { MATURE_DISCOVERY_PAGE_SIZE } from "../constants/matureDiscoveryFoundation";
import { DISCOVERY_DEFER_RADIO_IDLE_MS } from "../constants/discoveryPerformanceBudget";
import type { HiddenTunesStation, RadioStationListItem } from "../types/radio";
import { cancelMatureRadioDiscovery } from "../services/mature/matureRadioDiscovery";
import { loadMatureRadioHubLanePage } from "../services/mature/matureRadioHubLanes";
import { toRadioStationListItem } from "../services/radio/radioNormalizer";

export function useMatureRadioHubDiscovery(enabled: boolean, options?: { defer?: boolean }) {
  const stationStoreRef = useRef(new Map<string, HiddenTunesStation>());
  const [stations, setStations] = useState<RadioStationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(enabled && !options?.defer);

  const rememberStations = useCallback((items: HiddenTunesStation[]) => {
    items.forEach((station) => {
      stationStoreRef.current.set(station.id, station);
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      cancelMatureRadioDiscovery();
      setShouldLoad(false);
      setStations([]);
      setLoading(false);
      return;
    }

    if (options?.defer) {
      const timer = setTimeout(() => setShouldLoad(true), DISCOVERY_DEFER_RADIO_IDLE_MS);
      return () => clearTimeout(timer);
    }

    setShouldLoad(true);
  }, [enabled, options?.defer]);

  useEffect(() => {
    if (!enabled || !shouldLoad) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    void loadMatureRadioHubLanePage()
      .then((result) => {
        if (cancelled) return;
        rememberStations(result.stations);
        setStations(
          result.stations.slice(0, MATURE_DISCOVERY_PAGE_SIZE).map(toRadioStationListItem)
        );
      })
      .catch(() => {
        if (cancelled) return;
        setStations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, rememberStations, shouldLoad]);

  const resolveStation = useCallback((stationId: string) => {
    return stationStoreRef.current.get(stationId) || null;
  }, []);

  return {
    stations,
    loading,
    resolveStation,
  };
}

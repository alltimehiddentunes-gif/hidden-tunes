import { useEffect, useState } from "react";

import type { Track } from "../types/music";
import { catalogSongsToTracks } from "../utils/worldCatalogAdapter";
import {
  getHydratedCatalogSnapshot,
  loadHydratedCatalogOnce,
} from "./catalogFetchLayer";

export function useWorldCatalogTracks() {
  const [tracks, setTracks] = useState<Track[]>(() =>
    catalogSongsToTracks(getHydratedCatalogSnapshot())
  );
  const [loading, setLoading] = useState(() => tracks.length === 0);

  useEffect(() => {
    let cancelled = false;

    void loadHydratedCatalogOnce().then((songs) => {
      if (cancelled) return;

      setTracks(catalogSongsToTracks(songs));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { tracks, loading };
}

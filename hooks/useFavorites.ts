import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import {
  addFavorite as addFavoriteItem,
  filterVisibleFavorites,
  getFavorites,
  getFavoritesByType,
  getUnifiedFavoritesSnapshot,
  hydrateUnifiedFavorites,
  isFavorite as isStoredFavorite,
  removeFavorite as removeFavoriteItem,
  subscribeUnifiedFavorites,
  toggleFavorite as toggleFavoriteItem,
} from "../services/favorites/unifiedFavorites";
import type { FavoriteItemType, UnifiedFavoriteItem } from "../types/favorites";
import { favoriteStorageKey } from "../types/favorites";
import { logVisibleFeatureDiagnostic } from "../utils/visibleFeatureDiagnostics";
import { useMatureContentSettings } from "./useMatureContentSettings";

let favoritesProviderLogged = false;

export function useFavorites() {
  const snapshot = useSyncExternalStore(
    subscribeUnifiedFavorites,
    getUnifiedFavoritesSnapshot,
    getUnifiedFavoritesSnapshot
  );
  const { includeMatureInApi } = useMatureContentSettings();

  useEffect(() => {
    void hydrateUnifiedFavorites().then(() => {
      if (favoritesProviderLogged) return;
      favoritesProviderLogged = true;
      logVisibleFeatureDiagnostic("favorites_provider_mounted", {
        favoriteCount: getUnifiedFavoritesSnapshot().items.length,
      });
    });
  }, []);

  const lookupMap = useMemo(() => snapshot.lookup, [snapshot.lookup, snapshot.version]);

  const visibleFavorites = useMemo(
    () => filterVisibleFavorites(snapshot.items, includeMatureInApi),
    [snapshot.items, snapshot.version, includeMatureInApi]
  );

  const isFavorite = useCallback(
    (type: FavoriteItemType, id: string) => {
      if (!id) return false;
      return lookupMap.has(favoriteStorageKey(type, id));
    },
    [lookupMap]
  );

  const toggleFavorite = useCallback(async (item: UnifiedFavoriteItem) => {
    await toggleFavoriteItem(item);
  }, []);

  const addFavorite = useCallback(async (item: UnifiedFavoriteItem) => {
    await addFavoriteItem(item);
  }, []);

  const removeFavorite = useCallback(async (type: FavoriteItemType, id: string) => {
    await removeFavoriteItem(type, id);
  }, []);

  const refresh = useCallback(async () => {
    await hydrateUnifiedFavorites();
  }, []);

  return {
    favorites: snapshot.items,
    visibleFavorites,
    lookupMap,
    version: snapshot.version,
    isFavorite,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    getFavorites,
    getFavoritesByType,
    refresh,
    isStoredFavorite,
  };
}

export function useFavoriteStatus(type: FavoriteItemType, id: string) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(type, id);

  return {
    favorited,
    isFavorite: favorited,
    toggleFavorite,
  };
}

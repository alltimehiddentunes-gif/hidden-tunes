import { useMemo, useSyncExternalStore } from 'react'
import {
  addFavorite,
  clearType,
  getDesktopLibrarySnapshot,
  getItemsByType,
  isFavorite,
  removeFavorite,
  subscribeDesktopLibrary,
  toggleFavorite,
} from './libraryService'
import { filterLibraryItemsForDisplay, typeLabel } from './matureFilter'
import type { DesktopLibraryFilterId, DesktopLibraryItem, DesktopLibraryItemType } from './types'
import { libraryItemKey } from './identity'

export function useDesktopLibrary() {
  const snapshot = useSyncExternalStore(
    subscribeDesktopLibrary,
    getDesktopLibrarySnapshot,
    getDesktopLibrarySnapshot,
  )

  return useMemo(
    () => ({
      items: snapshot.items,
      countByType: snapshot.countByType,
      migrationStatus: snapshot.migrationStatus,
      isFavorite: (type: DesktopLibraryItemType, id: string) => isFavorite(type, id),
      addFavorite: (item: DesktopLibraryItem) => addFavorite(item),
      removeFavorite: (type: DesktopLibraryItemType, id: string) => removeFavorite(type, id),
      toggleFavorite: (item: DesktopLibraryItem) => toggleFavorite(item),
      getItemsByType: (type: DesktopLibraryItemType) => getItemsByType(type),
      clearType: (type: DesktopLibraryItemType) => clearType(type),
      filterItems: (
        filter: DesktopLibraryFilterId = 'all',
        options?: { includeMature?: boolean },
      ) =>
        filterLibraryItemsForDisplay(snapshot.items, {
          type: filter === 'all' ? 'all' : filter,
          includeMature: options?.includeMature,
        }),
      typeLabel,
      itemKey: libraryItemKey,
    }),
    [snapshot],
  )
}

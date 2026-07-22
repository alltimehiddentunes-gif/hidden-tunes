import { useMemo, useSyncExternalStore } from 'react'
import {
  clearAllHistory,
  clearHistoryByType,
  filterHistoryForDisplay,
  getHistoryStore,
  listContinueListening,
  listHistory,
  recordDesktopHistory,
  removeHistoryItem,
  subscribeDesktopHistory,
} from './historyService'
import type { DesktopHistoryItem, HistoryItemType } from './types'
import { historyItemKey } from './types'
import { isMatureLibraryAccessEnabled } from '../library/matureFilter'

export function useDesktopHistory() {
  const store = useSyncExternalStore(
    subscribeDesktopHistory,
    getHistoryStore,
    getHistoryStore,
  )

  return useMemo(() => {
    const includeMature = isMatureLibraryAccessEnabled()
    return {
      items: filterHistoryForDisplay(store.items, { includeMature }),
      allItems: store.items,
      continueListening: listContinueListening(),
      list: (type: HistoryItemType | 'all' = 'all') =>
        filterHistoryForDisplay(listHistory(type), { includeMature, type }),
      record: (item: Omit<DesktopHistoryItem, 'playedAt'> & { playedAt?: string }) =>
        recordDesktopHistory(item),
      remove: (type: HistoryItemType, id: string) => removeHistoryItem(type, id),
      clearType: (type: HistoryItemType) => clearHistoryByType(type),
      clearAll: () => clearAllHistory(),
      itemKey: historyItemKey,
    }
  }, [store])
}

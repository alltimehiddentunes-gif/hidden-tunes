import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  cancelDesktopDownload,
  getDesktopDownloadDiskUsage,
  getDesktopDownloadPlayableUrl,
  hasDesktopDownloadsBridge,
  listDesktopDownloads,
  pauseDesktopDownload,
  reconcileDesktopDownloads,
  removeDesktopDownload,
  resumeDesktopDownload,
  startDesktopDownload,
  subscribeDesktopDownloads,
} from './bridge'
import type { DesktopDownloadItem, DownloadStartRequest } from './types'
import { downloadIdentity } from './types'
import { isMatureLibraryAccessEnabled } from '../library/matureFilter'

function isMatureDownload(item: DesktopDownloadItem) {
  if (item.isMature === true) return true
  const rating = (item.contentRating || '').toLowerCase()
  return rating === 'adult' || rating === 'explicit' || rating === 'mature'
}

export function useDesktopDownloads() {
  const [items, setItems] = useState<DesktopDownloadItem[]>([])
  const [diskUsage, setDiskUsage] = useState<Awaited<ReturnType<typeof getDesktopDownloadDiskUsage>> | null>(null)
  const [bridgeAvailable, setBridgeAvailable] = useState(() => hasDesktopDownloadsBridge())
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setBridgeAvailable(hasDesktopDownloadsBridge())
    if (!hasDesktopDownloadsBridge()) {
      setItems([])
      return
    }
    try {
      const [nextItems, usage] = await Promise.all([
        listDesktopDownloads(),
        getDesktopDownloadDiskUsage(),
      ])
      setItems(nextItems)
      setDiskUsage(usage)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load downloads.')
    }
  }, [])

  useEffect(() => {
    void reconcileDesktopDownloads().finally(() => {
      void refresh()
    })
    if (!hasDesktopDownloadsBridge()) return
    return subscribeDesktopDownloads(() => {
      void refresh()
    })
  }, [refresh])

  const visibleItems = useMemo(() => {
    const includeMature = isMatureLibraryAccessEnabled()
    return items.filter((item) => includeMature || !isMatureDownload(item))
  }, [items])

  const byIdentity = useMemo(() => {
    const map = new Map<string, DesktopDownloadItem>()
    for (const item of items) {
      map.set(downloadIdentity(item.type, item.id), item)
    }
    return map
  }, [items])

  return {
    items: visibleItems,
    allItems: items,
    byIdentity,
    diskUsage,
    bridgeAvailable,
    error,
    refresh,
    isDownloaded: (type: DesktopDownloadItem['type'], id: string) => {
      const item = byIdentity.get(downloadIdentity(type, id))
      return item?.status === 'completed'
    },
    getItem: (type: DesktopDownloadItem['type'], id: string) =>
      byIdentity.get(downloadIdentity(type, id)) ?? null,
    start: async (request: DownloadStartRequest) => {
      const result = await startDesktopDownload(request)
      await refresh()
      return result
    },
    pause: async (downloadId: string) => {
      const result = await pauseDesktopDownload(downloadId)
      await refresh()
      return result
    },
    resume: async (downloadId: string) => {
      const result = await resumeDesktopDownload(downloadId)
      await refresh()
      return result
    },
    cancel: async (downloadId: string) => {
      const result = await cancelDesktopDownload(downloadId)
      await refresh()
      return result
    },
    remove: async (downloadId: string) => {
      const result = await removeDesktopDownload(downloadId)
      await refresh()
      return result
    },
    getPlayableUrl: getDesktopDownloadPlayableUrl,
  }
}

import type {
  DesktopDownloadItem,
  DownloadDiskUsage,
  DownloadStartRequest,
} from './types'

type DownloadsBridge = {
  list: () => Promise<DesktopDownloadItem[]>
  start: (request: DownloadStartRequest) => Promise<{
    ok: boolean
    item?: DesktopDownloadItem
    duplicate?: boolean
    errorCode?: string
    errorMessage?: string
  }>
  pause: (downloadId: string) => Promise<{ ok: boolean; resumable?: boolean }>
  resume: (downloadId: string) => Promise<{ ok: boolean; item?: DesktopDownloadItem; errorCode?: string; errorMessage?: string }>
  cancel: (downloadId: string) => Promise<{ ok: boolean }>
  remove: (downloadId: string) => Promise<{ ok: boolean }>
  getPlayableUrl: (downloadId: string) => Promise<{
    ok: boolean
    url?: string
    item?: DesktopDownloadItem
    errorCode?: string
    errorMessage?: string
  }>
  getDiskUsage: () => Promise<DownloadDiskUsage>
  reconcile: () => Promise<{ ok: boolean; count?: number }>
  subscribe: (listener: (payload: { event: string; payload: unknown }) => void) => () => void
}

declare global {
  interface Window {
    hiddenTunesDesktop?: {
      catalog?: { getJson: (path: string) => Promise<unknown> }
      downloads?: DownloadsBridge
    }
  }
}

export function hasDesktopDownloadsBridge() {
  return typeof window !== 'undefined' && typeof window.hiddenTunesDesktop?.downloads?.list === 'function'
}

function bridge(): DownloadsBridge {
  if (!hasDesktopDownloadsBridge()) {
    throw new Error('Desktop downloads bridge is unavailable. Open the Electron app to manage offline files.')
  }
  return window.hiddenTunesDesktop!.downloads!
}

export async function listDesktopDownloads() {
  if (!hasDesktopDownloadsBridge()) return [] as DesktopDownloadItem[]
  return bridge().list()
}

export async function startDesktopDownload(request: DownloadStartRequest) {
  return bridge().start(request)
}

export async function pauseDesktopDownload(downloadId: string) {
  return bridge().pause(downloadId)
}

export async function resumeDesktopDownload(downloadId: string) {
  return bridge().resume(downloadId)
}

export async function cancelDesktopDownload(downloadId: string) {
  return bridge().cancel(downloadId)
}

export async function removeDesktopDownload(downloadId: string) {
  return bridge().remove(downloadId)
}

export async function getDesktopDownloadPlayableUrl(downloadId: string) {
  return bridge().getPlayableUrl(downloadId)
}

export async function getDesktopDownloadDiskUsage() {
  if (!hasDesktopDownloadsBridge()) {
    return {
      downloadsBytes: 0,
      partialBytes: 0,
      freeBytes: null,
      rootLabel: 'downloads',
      maxItemBytes: 0,
      minFreeReserveBytes: 0,
      maxConcurrent: 0,
    } satisfies DownloadDiskUsage
  }
  return bridge().getDiskUsage()
}

export async function reconcileDesktopDownloads() {
  if (!hasDesktopDownloadsBridge()) return { ok: true, count: 0 }
  return bridge().reconcile()
}

export function subscribeDesktopDownloads(
  listener: (payload: { event: string; payload: unknown }) => void,
) {
  if (!hasDesktopDownloadsBridge()) return () => {}
  return bridge().subscribe(listener)
}

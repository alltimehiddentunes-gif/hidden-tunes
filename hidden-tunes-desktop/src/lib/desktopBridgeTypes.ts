/**
 * Canonical Electron preload bridge typings for window.hiddenTunesDesktop.
 * Keep a single ambient declaration — do not re-declare Window in feature modules.
 */

export type DesktopCatalogBridgeResponse = {
  ok: boolean
  status: number
  payload: unknown
}

export type DesktopCatalogBridgeApi = {
  getJson: (path: string) => Promise<DesktopCatalogBridgeResponse>
  requestJson?: (options: {
    path: string
    method?: 'GET' | 'POST'
    body?: Record<string, unknown> | null
  }) => Promise<DesktopCatalogBridgeResponse>
}

export type DesktopDownloadsBridgeApi = {
  list: () => Promise<unknown[]>
  start: (request: unknown) => Promise<{
    ok: boolean
    item?: unknown
    duplicate?: boolean
    errorCode?: string
    errorMessage?: string
  }>
  pause: (downloadId: string) => Promise<{ ok: boolean; resumable?: boolean }>
  resume: (
    downloadId: string,
  ) => Promise<{ ok: boolean; item?: unknown; errorCode?: string; errorMessage?: string }>
  cancel: (downloadId: string) => Promise<{ ok: boolean }>
  remove: (downloadId: string) => Promise<{ ok: boolean }>
  getPlayableUrl: (downloadId: string) => Promise<{
    ok: boolean
    url?: string
    item?: unknown
    errorCode?: string
    errorMessage?: string
  }>
  getDiskUsage: () => Promise<unknown>
  reconcile: () => Promise<{ ok: boolean; count?: number }>
  subscribe: (listener: (payload: { event: string; payload: unknown }) => void) => () => void
}

export type DesktopRuntimeBridgeInfo = {
  isPackaged: boolean
  environment: string
  ok?: boolean
  errors?: string[]
  warnings?: string[]
  expressConfigured?: boolean
  adminConfigured?: boolean
  sportsPilotConfigured?: boolean
}

export type DesktopShellBridgeApi = {
  /**
   * Ask main to open a URL in the OS browser after validation.
   * Only https: is accepted today; invalid/dangerous schemes are denied.
   */
  openExternalUrl: (url: string) => Promise<{ ok: boolean; reason?: string }>
}

export type HiddenTunesDesktopBridge = {
  catalog?: DesktopCatalogBridgeApi
  downloads?: DesktopDownloadsBridgeApi
  shell?: DesktopShellBridgeApi
  runtime?: {
    getInfo?: () => DesktopRuntimeBridgeInfo
  }
}

declare global {
  interface Window {
    hiddenTunesDesktop?: HiddenTunesDesktopBridge
  }
}

export {}

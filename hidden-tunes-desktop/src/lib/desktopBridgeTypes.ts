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

export type DesktopWindowBridgeApi = {
  minimize: () => Promise<{ ok: boolean }>
  toggleMaximize: () => Promise<{ ok: boolean; isMaximized?: boolean }>
  close: () => Promise<{ ok: boolean }>
  getState: () => Promise<DesktopWindowState>
  isFullScreen: () => Promise<boolean>
  setFullScreen: (enabled: boolean) => Promise<{ ok: boolean; isFullScreen?: boolean }>
  subscribeState: (listener: (state: DesktopWindowState) => void) => () => void
  subscribeFullScreen: (listener: (enabled: boolean) => void) => () => void
}

export type DesktopWindowState = {
  isMaximized: boolean
  isMinimized: boolean
  isFullScreen: boolean
}

export type HiddenTunesDesktopBridge = {
  artistProfile?: {
    request: (options: {
      path: string
      method: 'GET' | 'POST' | 'DELETE'
      token?: string | null
    }) => Promise<DesktopCatalogBridgeResponse>
  }
  authStorage?: {
    getItem: () => Promise<string | null>
    setItem: (value: string) => Promise<{ ok: boolean }>
    removeItem: () => Promise<{ ok: boolean }>
  }
  catalog?: DesktopCatalogBridgeApi
  downloads?: DesktopDownloadsBridgeApi
  shell?: DesktopShellBridgeApi
  window?: DesktopWindowBridgeApi
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

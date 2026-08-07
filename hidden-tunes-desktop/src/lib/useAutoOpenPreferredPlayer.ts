import { useCallback, useEffect, useRef } from 'react'
import { getPreferredNowPlayingStyle, type NowPlayingStyle } from './nowPlayingStyle'

export const AUTO_OPEN_PLAYER_IDLE_MS = 30_000
export const AUTO_OPEN_PLAYER_DISMISS_COOLDOWN_MS = 5 * 60_000
const POINTER_ACTIVITY_THROTTLE_MS = 750

type UseAutoOpenPreferredPlayerOptions = {
  isPlaying: boolean
  isLoading: boolean
  hasPlaybackError: boolean
  isMusicTrack: boolean
  currentTrackId: string | null
  activePage: string
  activeNavKey: string
  activeView: string
  anyPlayerOverlayOpen: boolean
  openPlayerByStyle: (style: NowPlayingStyle) => void
}

function hasBlockingInteraction() {
  const active = document.activeElement
  const typing = active instanceof HTMLInputElement
    || active instanceof HTMLTextAreaElement
    || active instanceof HTMLSelectElement
    || (active instanceof HTMLElement && active.isContentEditable)
  const blockers = document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [aria-modal="true"], [data-menu-open="true"], [data-dragging="true"]',
  )
  const visibleBlocker = [...blockers].some((element) => {
    const style = window.getComputedStyle(element)
    return element.getClientRects().length > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
  })
  return typing || visibleBlocker
}

async function readFullScreenState() {
  const bridge = window.hiddenTunesDesktop?.window
  if (bridge?.isFullScreen) return bridge.isFullScreen()
  return Boolean(document.fullscreenElement)
}

export function useAutoOpenPreferredPlayer({
  isPlaying,
  isLoading,
  hasPlaybackError,
  isMusicTrack,
  currentTrackId,
  activePage,
  activeNavKey,
  activeView,
  anyPlayerOverlayOpen,
  openPlayerByStyle,
}: UseAutoOpenPreferredPlayerOptions) {
  const timerRef = useRef<number | null>(null)
  const lastActivityRef = useRef(0)
  const lastPointerActivityRef = useRef(0)
  const lastPointerPositionRef = useRef<{ x: number; y: number } | null>(null)
  const dismissUntilRef = useRef(0)
  const autoOpenedRef = useRef(false)
  const previousTrackIdRef = useRef(currentTrackId)
  const eligibilityRef = useRef({
    isPlaying,
    isLoading,
    hasPlaybackError,
    isMusicTrack,
    currentTrackId,
    anyPlayerOverlayOpen,
  })

  useEffect(() => {
    eligibilityRef.current = {
      isPlaying,
      isLoading,
      hasPlaybackError,
      isMusicTrack,
      currentTrackId,
      anyPlayerOverlayOpen,
    }
  }, [anyPlayerOverlayOpen, currentTrackId, hasPlaybackError, isLoading, isMusicTrack, isPlaying])

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const auditWindow = window as typeof window & {
      __HT_NOW_PLAYING_AUDIT__?: { snapshot: () => Promise<Record<string, unknown>> }
    }
    auditWindow.__HT_NOW_PLAYING_AUDIT__ = {
      snapshot: async () => ({
        ...eligibilityRef.current,
        fullScreen: await readFullScreenState(),
        focused: document.hasFocus(),
        visible: document.visibilityState === 'visible',
        blockingInteraction: hasBlockingInteraction(),
        idleMs: Date.now() - lastActivityRef.current,
        cooldownMs: Math.max(0, dismissUntilRef.current - Date.now()),
        timerScheduled: timerRef.current != null,
        autoOpened: autoOpenedRef.current,
      }),
    }
    return () => {
      delete auditWindow.__HT_NOW_PLAYING_AUDIT__
    }
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const attemptAutoOpen = useCallback(async () => {
    timerRef.current = null
    const state = eligibilityRef.current
    if (!state.isPlaying || state.isLoading || state.hasPlaybackError || !state.isMusicTrack) return
    if (!state.currentTrackId || state.anyPlayerOverlayOpen || Date.now() < dismissUntilRef.current) return
    if (document.visibilityState !== 'visible' || !document.hasFocus() || hasBlockingInteraction()) return
    if (!(await readFullScreenState())) return
    if (Date.now() - lastActivityRef.current < AUTO_OPEN_PLAYER_IDLE_MS) return
    autoOpenedRef.current = true
    openPlayerByStyle(getPreferredNowPlayingStyle())
  }, [openPlayerByStyle])

  const scheduleFromLastActivity = useCallback(() => {
    clearTimer()
    const elapsed = Date.now() - lastActivityRef.current
    timerRef.current = window.setTimeout(() => void attemptAutoOpen(), Math.max(0, AUTO_OPEN_PLAYER_IDLE_MS - elapsed))
  }, [attemptAutoOpen, clearTimer])

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    scheduleFromLastActivity()
  }, [scheduleFromLastActivity])

  const cancelAutoOpenPlayer = useCallback(() => {
    clearTimer()
    lastActivityRef.current = Date.now()
  }, [clearTimer])

  const openPreferredNowPlayingPage = useCallback(() => {
    cancelAutoOpenPlayer()
    dismissUntilRef.current = 0
    autoOpenedRef.current = false
    openPlayerByStyle(getPreferredNowPlayingStyle())
  }, [cancelAutoOpenPlayer, openPlayerByStyle])

  const markPlayerManuallyDismissed = useCallback(() => {
    if (autoOpenedRef.current) {
      dismissUntilRef.current = Date.now() + AUTO_OPEN_PLAYER_DISMISS_COOLDOWN_MS
    }
    autoOpenedRef.current = false
    recordActivity()
  }, [recordActivity])

  useEffect(() => {
    if (previousTrackIdRef.current !== currentTrackId && currentTrackId) {
      dismissUntilRef.current = 0
      autoOpenedRef.current = false
      previousTrackIdRef.current = currentTrackId
      recordActivity()
    }
  }, [currentTrackId, recordActivity])

  useEffect(() => {
    lastActivityRef.current = Date.now()
    const pointer = (event: PointerEvent) => {
      const now = Date.now()
      if (now - lastPointerActivityRef.current < POINTER_ACTIVITY_THROTTLE_MS) return
      const previous = lastPointerPositionRef.current
      lastPointerPositionRef.current = { x: event.clientX, y: event.clientY }
      if (previous && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 4) return
      lastPointerActivityRef.current = now
      recordActivity()
    }
    const activity = () => recordActivity()
    const visibility = () => recordActivity()
    const fullscreen = () => recordActivity()
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'wheel', 'keydown', 'touchstart', 'resize']
    window.addEventListener('pointermove', pointer, { passive: true })
    events.forEach((event) => window.addEventListener(event, activity, { passive: true }))
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('fullscreenchange', fullscreen)
    const unsubscribe = window.hiddenTunesDesktop?.window?.subscribeFullScreen?.(fullscreen)
    scheduleFromLastActivity()
    return () => {
      clearTimer()
      window.removeEventListener('pointermove', pointer)
      events.forEach((event) => window.removeEventListener(event, activity))
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('fullscreenchange', fullscreen)
      unsubscribe?.()
    }
  }, [clearTimer, recordActivity, scheduleFromLastActivity])

  useEffect(() => recordActivity(), [activeNavKey, activePage, activeView, recordActivity])
  useEffect(() => {
    if (!isPlaying || isLoading || hasPlaybackError || !isMusicTrack || anyPlayerOverlayOpen) clearTimer()
    else scheduleFromLastActivity()
  }, [anyPlayerOverlayOpen, clearTimer, hasPlaybackError, isLoading, isMusicTrack, isPlaying, scheduleFromLastActivity])

  return {
    cancelAutoOpenPlayer,
    openPreferredNowPlayingPage,
    markPlayerManuallyDismissed,
  }
}

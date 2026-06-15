import { useCallback, useEffect, useRef } from 'react'
import { getPreferredNowPlayingStyle, type NowPlayingStyle } from './nowPlayingStyle'

export const AUTO_OPEN_PLAYER_DELAY_MS = 1500

type NavSnapshot = {
  activePage: string
  activeNavKey: string
}

type UseAutoOpenPreferredPlayerOptions = {
  isPlaying: boolean
  isLoading: boolean
  currentTrackId: string | null
  activePage: string
  activeNavKey: string
  activeView: string
  anyPlayerOverlayOpen: boolean
  openPlayerByStyle: (style: NowPlayingStyle) => void
}

export function useAutoOpenPreferredPlayer({
  isPlaying,
  isLoading,
  currentTrackId,
  activePage,
  activeNavKey,
  activeView,
  anyPlayerOverlayOpen,
  openPlayerByStyle,
}: UseAutoOpenPreferredPlayerOptions) {
  const timerRef = useRef<number | null>(null)
  const sessionRef = useRef(0)
  const pendingTrackIdRef = useRef<string | null>(null)
  const delayElapsedRef = useRef(false)
  const playbackStartedRef = useRef(false)
  const sawSongViewRef = useRef(false)
  const navSnapshotRef = useRef<NavSnapshot>({ activePage, activeNavKey })

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const cancelAutoOpenPlayer = useCallback(() => {
    clearTimer()
    pendingTrackIdRef.current = null
    delayElapsedRef.current = false
    playbackStartedRef.current = false
    sawSongViewRef.current = false
  }, [clearTimer])

  const tryCompleteAutoOpen = useCallback(() => {
    const trackId = pendingTrackIdRef.current
    if (!trackId || !delayElapsedRef.current) return false
    if (anyPlayerOverlayOpen) return false
    if (isLoading) return false
    if (!isPlaying) return false
    if (currentTrackId !== trackId) return false

    cancelAutoOpenPlayer()
    openPlayerByStyle(getPreferredNowPlayingStyle())
    return true
  }, [
    anyPlayerOverlayOpen,
    cancelAutoOpenPlayer,
    currentTrackId,
    isLoading,
    isPlaying,
    openPlayerByStyle,
  ])

  const openPreferredNowPlayingPage = useCallback(() => {
    cancelAutoOpenPlayer()
    openPlayerByStyle(getPreferredNowPlayingStyle())
  }, [cancelAutoOpenPlayer, openPlayerByStyle])

  const scheduleAutoOpenPlayerAfterSongTap = useCallback((trackId: string) => {
    cancelAutoOpenPlayer()
    const session = ++sessionRef.current
    pendingTrackIdRef.current = trackId
    delayElapsedRef.current = false
    navSnapshotRef.current = { activePage, activeNavKey }

    timerRef.current = window.setTimeout(() => {
      if (sessionRef.current !== session) return
      if (pendingTrackIdRef.current !== trackId) return
      delayElapsedRef.current = true
      timerRef.current = null
      tryCompleteAutoOpen()
    }, AUTO_OPEN_PLAYER_DELAY_MS)
  }, [activeNavKey, activePage, cancelAutoOpenPlayer, tryCompleteAutoOpen])

  useEffect(() => {
    if (!pendingTrackIdRef.current) return
    tryCompleteAutoOpen()
  }, [currentTrackId, isLoading, isPlaying, tryCompleteAutoOpen])

  useEffect(() => {
    if (!pendingTrackIdRef.current) return
    if (isPlaying) {
      playbackStartedRef.current = true
      return
    }
    if (playbackStartedRef.current) {
      cancelAutoOpenPlayer()
    }
  }, [cancelAutoOpenPlayer, isPlaying])

  useEffect(() => {
    if (!pendingTrackIdRef.current) return
    const snapshot = navSnapshotRef.current
    if (activePage !== snapshot.activePage || activeNavKey !== snapshot.activeNavKey) {
      cancelAutoOpenPlayer()
    }
  }, [activeNavKey, activePage, cancelAutoOpenPlayer])

  useEffect(() => {
    if (!pendingTrackIdRef.current) return
    if (activeView === 'song') {
      sawSongViewRef.current = true
      return
    }
    if (sawSongViewRef.current) {
      cancelAutoOpenPlayer()
    }
  }, [activeView, cancelAutoOpenPlayer])

  useEffect(() => {
    if (!pendingTrackIdRef.current || !anyPlayerOverlayOpen) return
    cancelAutoOpenPlayer()
  }, [anyPlayerOverlayOpen, cancelAutoOpenPlayer])

  useEffect(() => () => cancelAutoOpenPlayer(), [cancelAutoOpenPlayer])

  return {
    scheduleAutoOpenPlayerAfterSongTap,
    cancelAutoOpenPlayer,
    openPreferredNowPlayingPage,
  }
}

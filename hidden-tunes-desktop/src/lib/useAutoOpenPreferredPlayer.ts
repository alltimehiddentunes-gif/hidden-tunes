import { useCallback, useEffect, useRef } from 'react'
import { getPreferredNowPlayingStyle, type NowPlayingStyle } from './nowPlayingStyle'

export const AUTO_OPEN_PLAYER_DELAY_MS = 1500

type NavSnapshot = {
  activePage: string
  activeNavKey: string
}

type UseAutoOpenPreferredPlayerOptions = {
  isPlaying: boolean
  activePage: string
  activeNavKey: string
  activeView: string
  anyPlayerOverlayOpen: boolean
  openPlayerByStyle: (style: NowPlayingStyle) => void
}

export function useAutoOpenPreferredPlayer({
  isPlaying,
  activePage,
  activeNavKey,
  activeView,
  anyPlayerOverlayOpen,
  openPlayerByStyle,
}: UseAutoOpenPreferredPlayerOptions) {
  const timerRef = useRef<number | null>(null)
  const sessionRef = useRef(0)
  const trackIdRef = useRef<string | null>(null)
  const playbackStartedRef = useRef(false)
  const sawSongViewRef = useRef(false)
  const navSnapshotRef = useRef<NavSnapshot>({ activePage, activeNavKey })

  const cancelAutoOpenPlayer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    trackIdRef.current = null
    playbackStartedRef.current = false
    sawSongViewRef.current = false
  }, [])

  const openPreferredNowPlayingPage = useCallback(() => {
    cancelAutoOpenPlayer()
    openPlayerByStyle(getPreferredNowPlayingStyle())
  }, [cancelAutoOpenPlayer, openPlayerByStyle])

  const scheduleAutoOpenPlayerAfterSongTap = useCallback((trackId: string) => {
    cancelAutoOpenPlayer()
    const session = ++sessionRef.current
    trackIdRef.current = trackId
    navSnapshotRef.current = { activePage, activeNavKey }

    timerRef.current = window.setTimeout(() => {
      if (sessionRef.current !== session) return
      if (trackIdRef.current !== trackId) return
      timerRef.current = null
      trackIdRef.current = null
      playbackStartedRef.current = false
      sawSongViewRef.current = false
      openPreferredNowPlayingPage()
    }, AUTO_OPEN_PLAYER_DELAY_MS)
  }, [activeNavKey, activePage, cancelAutoOpenPlayer, openPreferredNowPlayingPage])

  useEffect(() => {
    if (!trackIdRef.current) return
    if (isPlaying) {
      playbackStartedRef.current = true
      return
    }
    if (playbackStartedRef.current) {
      cancelAutoOpenPlayer()
    }
  }, [cancelAutoOpenPlayer, isPlaying])

  useEffect(() => {
    if (!trackIdRef.current) return
    const snapshot = navSnapshotRef.current
    if (activePage !== snapshot.activePage || activeNavKey !== snapshot.activeNavKey) {
      cancelAutoOpenPlayer()
    }
  }, [activeNavKey, activePage, cancelAutoOpenPlayer])

  useEffect(() => {
    if (!trackIdRef.current) return
    if (activeView === 'song') {
      sawSongViewRef.current = true
      return
    }
    if (sawSongViewRef.current) {
      cancelAutoOpenPlayer()
    }
  }, [activeView, cancelAutoOpenPlayer])

  useEffect(() => {
    if (!trackIdRef.current || !anyPlayerOverlayOpen) return
    cancelAutoOpenPlayer()
  }, [anyPlayerOverlayOpen, cancelAutoOpenPlayer])

  useEffect(() => () => cancelAutoOpenPlayer(), [cancelAutoOpenPlayer])

  return {
    scheduleAutoOpenPlayerAfterSongTap,
    cancelAutoOpenPlayer,
    openPreferredNowPlayingPage,
  }
}

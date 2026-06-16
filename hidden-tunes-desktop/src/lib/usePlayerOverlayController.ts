import { useCallback, useEffect, useRef, useState } from 'react'
import type { NowPlayingStyle } from './nowPlayingStyle'
import {
  PLAYER_OVERLAY_ENTER_MS,
  PLAYER_OVERLAY_EXIT_MS,
  PLAYER_OVERLAY_SWITCH_MS,
  syncPlayerOverlayDocumentState,
  type PlayerOverlayPhase,
} from './playerOverlayTransition'

type PlayerOverlayController = {
  openPlayerStyle: NowPlayingStyle | null
  renderedPlayerStyle: NowPlayingStyle | null
  overlayPhase: PlayerOverlayPhase
  anyPlayerShellVisible: boolean
  openPlayerByStyle: (style: NowPlayingStyle) => void
  closePlayerOverlay: () => void
}

export function usePlayerOverlayController(): PlayerOverlayController {
  const [openPlayerStyle, setOpenPlayerStyle] = useState<NowPlayingStyle | null>(null)
  const [renderedPlayerStyle, setRenderedPlayerStyle] = useState<NowPlayingStyle | null>(null)
  const [overlayPhase, setOverlayPhase] = useState<PlayerOverlayPhase>('idle')
  const phaseTimerRef = useRef<number | null>(null)
  const openPlayerStyleRef = useRef<NowPlayingStyle | null>(null)

  openPlayerStyleRef.current = openPlayerStyle

  const clearPhaseTimer = useCallback(() => {
    if (phaseTimerRef.current != null) {
      window.clearTimeout(phaseTimerRef.current)
      phaseTimerRef.current = null
    }
  }, [])

  const schedulePhaseIdle = useCallback((delayMs: number) => {
    clearPhaseTimer()
    phaseTimerRef.current = window.setTimeout(() => {
      setOverlayPhase('idle')
      phaseTimerRef.current = null
    }, delayMs)
  }, [clearPhaseTimer])

  useEffect(() => {
    syncPlayerOverlayDocumentState(overlayPhase, renderedPlayerStyle)
  }, [overlayPhase, renderedPlayerStyle])

  useEffect(() => () => {
    clearPhaseTimer()
    syncPlayerOverlayDocumentState('idle', null)
  }, [clearPhaseTimer])

  const openPlayerByStyle = useCallback((style: NowPlayingStyle) => {
    const previousStyle = openPlayerStyleRef.current
    const isSwitch = previousStyle != null && previousStyle !== style

    setOpenPlayerStyle(style)
    setRenderedPlayerStyle(style)

    if (isSwitch) {
      setOverlayPhase('switch')
      schedulePhaseIdle(PLAYER_OVERLAY_SWITCH_MS)
      return
    }

    setOverlayPhase('enter')
    schedulePhaseIdle(PLAYER_OVERLAY_ENTER_MS)
  }, [schedulePhaseIdle])

  const closePlayerOverlay = useCallback(() => {
    if (!openPlayerStyleRef.current && overlayPhase !== 'exit') return

    clearPhaseTimer()
    setOpenPlayerStyle(null)
    setOverlayPhase('exit')

    phaseTimerRef.current = window.setTimeout(() => {
      setRenderedPlayerStyle(null)
      setOverlayPhase('idle')
      phaseTimerRef.current = null
    }, PLAYER_OVERLAY_EXIT_MS)
  }, [clearPhaseTimer, overlayPhase])

  return {
    openPlayerStyle,
    renderedPlayerStyle,
    overlayPhase,
    anyPlayerShellVisible: renderedPlayerStyle != null,
    openPlayerByStyle,
    closePlayerOverlay,
  }
}

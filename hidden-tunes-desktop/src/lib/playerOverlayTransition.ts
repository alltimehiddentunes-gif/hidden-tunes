import type { NowPlayingStyle } from './nowPlayingStyle'

export type PlayerOverlayPhase = 'idle' | 'enter' | 'exit' | 'switch'

export const PLAYER_OVERLAY_ENTER_MS = 320
export const PLAYER_OVERLAY_EXIT_MS = 220
export const PLAYER_OVERLAY_SWITCH_MS = 180

export function overlayPhaseDataAttr(phase: PlayerOverlayPhase): string | undefined {
  return phase === 'idle' ? undefined : phase
}

export function syncPlayerOverlayDocumentState(
  phase: PlayerOverlayPhase,
  style: NowPlayingStyle | null,
): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  if (phase === 'idle' && !style) {
    delete root.dataset.htPlayerOverlay
    delete root.dataset.htPlayerOverlayPhase
    delete root.dataset.htPlayerOverlayStyle
    return
  }

  root.dataset.htPlayerOverlay = 'open'
  root.dataset.htPlayerOverlayPhase = phase
  if (style) {
    root.dataset.htPlayerOverlayStyle = style
  }
}

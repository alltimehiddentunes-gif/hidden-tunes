import { memo } from 'react'

/**
 * Single shared Hidden Tunes atmosphere for the entire desktop shell.
 * Visual source of truth: mobile Home (`app/music-feed.tsx` GRADIENTS.main +
 * PremiumAmbientGlow orbs). Static CSS layers only — no animation timers,
 * no artwork colour extraction, no per-route copies.
 */
function HiddenTunesGlobalBackgroundComponent() {
  return (
    <div className="ht-global-backdrop" aria-hidden="true" data-ht-global-backdrop="true">
      <div className="ht-global-backdrop__base" />
      <div className="ht-global-backdrop__glow ht-global-backdrop__glow--purple" />
      <div className="ht-global-backdrop__glow ht-global-backdrop__glow--cyan" />
      <div className="ht-global-backdrop__glow ht-global-backdrop__glow--center" />
    </div>
  )
}

export const HiddenTunesGlobalBackground = memo(HiddenTunesGlobalBackgroundComponent)

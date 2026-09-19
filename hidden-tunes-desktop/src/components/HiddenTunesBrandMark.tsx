import { useState, type SyntheticEvent } from 'react'
import { HIDDEN_TUNES_BRAND } from '../lib/brandAssets'

type HiddenTunesBrandMarkProps = {
  className?: string
  decorative?: boolean
}

export function HiddenTunesBrandMark({ className, decorative = true }: HiddenTunesBrandMarkProps) {
  const [loadFailed, setLoadFailed] = useState(false)

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.hidden = true
    setLoadFailed(true)

    if (import.meta.env.DEV && !hasLoggedBrandMarkFailure) {
      hasLoggedBrandMarkFailure = true
      console.error('[Hidden Tunes Desktop] Official brand mark failed to load', {
        src: event.currentTarget.currentSrc || event.currentTarget.src,
      })
    }
  }

  return (
    <img
      className={className}
      src={HIDDEN_TUNES_BRAND.mark}
      alt={decorative ? '' : 'Hidden Tunes'}
      aria-hidden={decorative || undefined}
      draggable={false}
      hidden={loadFailed}
      onError={handleError}
    />
  )
}

let hasLoggedBrandMarkFailure = false

import { HIDDEN_TUNES_BRAND } from '../lib/brandAssets'

type HiddenTunesBrandMarkProps = {
  className?: string
  decorative?: boolean
}

export function HiddenTunesBrandMark({ className, decorative = true }: HiddenTunesBrandMarkProps) {
  return (
    <img
      className={className}
      src={HIDDEN_TUNES_BRAND.mark}
      alt={decorative ? '' : 'Hidden Tunes'}
      aria-hidden={decorative || undefined}
      draggable={false}
    />
  )
}

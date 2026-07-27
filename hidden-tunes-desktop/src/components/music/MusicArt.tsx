import { memo } from 'react'
import { ArtworkImage } from '../ArtworkImage'

/**
 * Bounded artwork shell for Music pages.
 * Global `.art-frame` is absolute/inset and fills `.page-view` without a relative parent.
 * Do not change Home's `HomeArt` — keep Music containment local.
 */
export const MusicArt = memo(function MusicArt({
  src,
  seed,
  label,
  variant = 'square',
  size = 'rail',
  priority = false,
}: {
  src: string | null
  seed: string
  label: string
  variant?: 'square' | 'circle' | 'wide'
  size?: 'rail' | 'featured' | 'chip' | 'list'
  priority?: boolean
}) {
  return (
    <span
      className={`music-art music-art--${size}${variant === 'circle' ? ' music-art--circle' : ''}`}
      aria-hidden="true"
    >
      <ArtworkImage
        src={src}
        alt=""
        seed={seed}
        label={label}
        variant={variant === 'wide' ? 'wide' : variant === 'circle' ? 'circle' : 'square'}
        priority={priority}
      />
    </span>
  )
})

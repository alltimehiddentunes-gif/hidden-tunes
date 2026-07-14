import { memo, useMemo, useState } from 'react'
import { deriveEntityInitials } from '../lib/artworkIntegrity'

export const ArtworkImage = memo(function ArtworkImage({
  src,
  alt,
  seed,
  label,
  variant = 'square',
  priority = false,
}: {
  src: string | null
  alt: string
  seed: string
  label?: string
  variant?: 'square' | 'wide' | 'circle'
  priority?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const initials = useMemo(
    () => deriveEntityInitials(label ?? seed),
    [label, seed],
  )

  return (
    <div className={`art-frame art-frame--${variant}`}>
      {!src || failed ? (
        <div
          className={`art-empty-state art-empty-state--${variant === 'circle' ? 'square' : variant}`}
          aria-hidden={alt ? undefined : true}
        >
          <span className="art-empty-initials">{initials}</span>
        </div>
      ) : (
        <img
          key={seed}
          src={src}
          alt={alt}
          className="card-art-img"
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
})

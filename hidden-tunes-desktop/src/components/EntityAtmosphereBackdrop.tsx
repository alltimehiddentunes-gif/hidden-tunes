import { memo } from 'react'
import { deriveEntityInitials } from '../lib/artworkIntegrity'

export type EntityAtmosphereBackdropProps = {
  artworkUrl: string | null
  label: string
  variant?: 'hero' | 'player' | 'panel'
  className?: string
  /** When false, parent veil layers remain responsible for contrast */
  showVeil?: boolean
}

/**
 * Blurred entity artwork or premium name-based placeholder.
 * Never uses PSD page screenshots — only real standalone URLs.
 */
export const EntityAtmosphereBackdrop = memo(function EntityAtmosphereBackdrop({
  artworkUrl,
  label,
  variant = 'player',
  className = '',
  showVeil = false,
}: EntityAtmosphereBackdropProps) {
  const initials = deriveEntityInitials(label)

  return (
    <div
      className={`entity-atmosphere entity-atmosphere--${variant}${artworkUrl ? '' : ' entity-atmosphere--placeholder'} ${className}`.trim()}
      aria-hidden="true"
    >
      {artworkUrl ? (
        <img src={artworkUrl} alt="" className="entity-atmosphere-img" decoding="async" />
      ) : (
        <span className="entity-atmosphere-initials">{initials}</span>
      )}
      {showVeil ? <div className="entity-atmosphere-veil" /> : null}
    </div>
  )
})

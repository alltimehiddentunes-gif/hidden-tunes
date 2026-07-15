import type { CSSProperties } from 'react'

export type SectionHeroProps = {
  title: string
  subtitle?: string
  artwork?: string
  artworkAlt?: string
  className?: string
  objectPosition?: string
  titleId?: string
}

export function SectionHero({
  title,
  subtitle,
  artwork,
  artworkAlt = '',
  className,
  objectPosition = 'center center',
  titleId,
}: SectionHeroProps) {
  const resolvedTitleId =
    titleId ?? `section-hero-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const artworkStyle = { objectPosition } satisfies CSSProperties

  return (
    <section
      className={['sectionHero', className].filter(Boolean).join(' ')}
      aria-labelledby={resolvedTitleId}
    >
      {artwork ? (
        <img
          className="sectionHeroArtwork"
          src={artwork}
          alt={artworkAlt}
          aria-hidden={!artworkAlt}
          style={artworkStyle}
        />
      ) : null}

      <div className="sectionHeroGradient" aria-hidden="true" />

      <div className="sectionHeroContent">
        <h1 id={resolvedTitleId}>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </section>
  )
}

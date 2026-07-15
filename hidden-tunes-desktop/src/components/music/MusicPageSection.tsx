import { memo, type ReactNode } from 'react'

export const MusicPageSection = memo(function MusicPageSection({
  title,
  hint,
  loading,
  error,
  onRetry,
  onViewAll,
  children,
}: {
  title: string
  hint?: string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  onViewAll?: () => void
  children: ReactNode
}) {
  const headingId = `music-page-${title.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <section className="music-page-section" aria-labelledby={headingId}>
      <header className="music-page-section-header">
        <div>
          <h2 id={headingId}>{title}</h2>
          {hint ? <p className="music-page-section-hint">{hint}</p> : null}
        </div>
        {onViewAll ? (
          <button type="button" className="music-page-view-all" onClick={onViewAll}>
            View all
          </button>
        ) : null}
      </header>
      {loading ? (
        <div className="music-page-skeleton" aria-busy="true" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="music-page-skeleton-card" />
          ))}
        </div>
      ) : error ? (
        <div className="music-page-section-error" role="alert">
          <p>This section could not be loaded.</p>
          {onRetry ? (
            <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        children
      )}
    </section>
  )
})

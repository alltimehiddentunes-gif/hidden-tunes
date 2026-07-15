import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import type { TvChannelMeta, TvFilterId } from '../../lib/tv/types'
import { useTvPageData } from '../../lib/tv/useTvPageData'
import { isTvFavorite, toggleTvFavorite } from '../../lib/tv/tvLocalState'
import tvArtwork from '../../assets/section-headers/tv-lakeside-cabin.png'
import { SectionHero } from '../SectionHero'

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
}

type TvPageProps = {
  query: string
  onPlayTvChannel: (
    channel: TvChannelMeta,
    queue: TvChannelMeta[],
    startIndex: number,
    queueTitle: string,
  ) => void
  ArtworkImage: ComponentType<ArtworkImageProps>
}

function formatChannelMeta(channel: TvChannelMeta) {
  const parts = [channel.country, channel.language, channel.categories[0]].filter(Boolean)
  return parts.join(' · ') || 'Live stream'
}

function regionCode(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return '—'
  const words = trimmed.split(/\s+/)
  if (words.length >= 2) {
    return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}

const ChannelCard = memo(function ChannelCard({
  channel,
  tuning,
  isFavorite,
  onPlay,
  onToggleFavorite,
  ArtworkImage,
}: {
  channel: TvChannelMeta
  tuning: boolean
  isFavorite: boolean
  onPlay: () => void
  onToggleFavorite: () => void
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  return (
    <article className="tv-station-card">
      <button
        type="button"
        className="tv-station-card-hit"
        onClick={onPlay}
        disabled={tuning}
        aria-label={`Watch ${channel.title}`}
      >
        <div className="tv-station-card-art">
          <ArtworkImage
            src={channel.artworkUrl}
            alt=""
            seed={channel.id}
            label={channel.title}
          />
          <span className="tv-live-badge">LIVE</span>
          <span className="tv-station-card-play" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
        <div className="tv-station-card-copy">
          <h3>{channel.channelName ?? channel.title}</h3>
          <p>{formatChannelMeta(channel)}</p>
        </div>
      </button>
      <button
        type="button"
        className={`tv-favorite-btn${isFavorite ? ' is-active' : ''}`}
        onClick={onToggleFavorite}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path d="M12 21s-7-4.5-9.5-9C1 8 3 4 7 4c2 0 3.5 1.5 5 3 1.5-1.5 3-3 5-3 4 0 6 4 3.5 8C19 16.5 12 21 12 21z" />
        </svg>
      </button>
    </article>
  )
})

function ChannelSkeleton() {
  return (
    <article className="tv-station-card tv-station-card--skeleton" aria-hidden="true">
      <div className="tv-station-card-art" />
      <div className="tv-station-card-copy">
        <span />
        <span />
      </div>
    </article>
  )
}

export const TvPage = memo(function TvPage({
  query,
  onPlayTvChannel,
  ArtworkImage,
}: TvPageProps) {
  const [activeFilter, setActiveFilter] = useState<TvFilterId>('all')
  const [tuningChannelId, setTuningChannelId] = useState<string | null>(null)
  const [favoriteRevision, setFavoriteRevision] = useState(0)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const { currentTrack, isPlaying } = useDesktopPlayback()

  const {
    featuredChannels,
    catalogChannels,
    browseCategories,
    regions,
    filterChips,
    loading,
    catalogLoading,
    loadingMore,
    error,
    catalogError,
    selectedCategory,
    setSelectedCategory,
    selectedRegion,
    setSelectedRegion,
    hasMore,
    loadMore,
    retry,
    resetCatalogQuery,
  } = useTvPageData(activeFilter, query)

  const activeTvChannelId = useMemo(() => {
    if (!currentTrack?.id.startsWith('tv-')) return null
    return currentTrack.id.slice('tv-'.length)
  }, [currentTrack?.id])

  const favoriteIds = useMemo(() => {
    void favoriteRevision
    return new Set(
      featuredChannels
        .concat(catalogChannels)
        .map((channel) => (isTvFavorite(channel.id) ? channel.id : null))
        .filter((entry): entry is string => Boolean(entry)),
    )
  }, [catalogChannels, favoriteRevision, featuredChannels])

  const playChannel = useCallback(
    async (
      channel: TvChannelMeta,
      queue: TvChannelMeta[],
      queueTitle: string,
    ) => {
      const startIndex = Math.max(0, queue.findIndex((entry) => entry.id === channel.id))
      setTuningChannelId(channel.id)
      try {
        onPlayTvChannel(channel, queue, startIndex, queueTitle)
      } finally {
        window.setTimeout(() => setTuningChannelId(null), 800)
      }
    },
    [onPlayTvChannel],
  )

  const handleToggleFavorite = useCallback((channelId: string) => {
    toggleTvFavorite(channelId)
    setFavoriteRevision((value) => value + 1)
  }, [])

  const handleFilterChange = useCallback((filter: TvFilterId) => {
    setActiveFilter(filter)
    resetCatalogQuery()
  }, [resetCatalogQuery])

  const handleCategorySelect = useCallback((label: string) => {
    setSelectedCategory((current) => (current === label ? null : label))
    resetCatalogQuery()
  }, [resetCatalogQuery, setSelectedCategory])

  const handleRegionSelect = useCallback((name: string) => {
    setSelectedRegion((current) => (current === name ? null : name))
    resetCatalogQuery()
  }, [resetCatalogQuery, setSelectedRegion])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore()
        }
      },
      { rootMargin: '240px 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  const showEmpty =
    !loading
    && !catalogLoading
    && catalogChannels.length === 0
    && !error

  return (
    <div className="tv-destination">
      <SectionHero
        title="TV"
        subtitle="Tuned to the world. Always on."
        artwork={tvArtwork}
        artworkAlt=""
        objectPosition="center center"
        titleId="tv-page-heading"
      />

      <div className="tv-tabs" role="tablist" aria-label="TV categories">
        {filterChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={activeFilter === chip.id}
            className={`tv-tab${activeFilter === chip.id ? ' is-active' : ''}`}
            onClick={() => handleFilterChange(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {error ? (
        <section className="tv-status tv-status--error" role="alert">
          <p>TV could not be loaded.</p>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void retry()}>
            Retry
          </button>
        </section>
      ) : loading ? (
        <section className="tv-status" aria-busy="true">
          <p>Loading TV catalog…</p>
        </section>
      ) : null}

      {!error && !loading ? (
        <>
          {activeFilter === 'genres' && browseCategories.length > 0 ? (
            <section className="tv-section" aria-labelledby="tv-genre-heading">
              <div className="tv-section-header">
                <h2 id="tv-genre-heading">Browse by Category</h2>
              </div>
              <div className="tv-genre-grid">
                {browseCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`tv-genre-card${selectedCategory === category.label ? ' is-active' : ''}`}
                    onClick={() => {
                      handleCategorySelect(category.label)
                      setActiveFilter('all')
                    }}
                  >
                    <span className="tv-genre-icon" aria-hidden="true">{category.icon}</span>
                    <strong>{category.label}</strong>
                    <span>{category.count.toLocaleString()} channels</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {featuredChannels.length > 0 && activeFilter !== 'genres' ? (
            <section className="tv-section" aria-labelledby="tv-featured-heading">
              <div className="tv-section-header">
                <h2 id="tv-featured-heading">Featured Channels</h2>
              </div>
              <div className="tv-station-rail">
                {featuredChannels.map((channel) => (
                  <ChannelCard
                    key={channel.id}
                    channel={channel}
                    tuning={tuningChannelId === channel.id}
                    isFavorite={favoriteIds.has(channel.id)}
                    onPlay={() => {
                      void playChannel(channel, featuredChannels, 'Featured Channels')
                    }}
                    onToggleFavorite={() => handleToggleFavorite(channel.id)}
                    ArtworkImage={ArtworkImage}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {browseCategories.length > 0 && activeFilter !== 'genres' ? (
            <section className="tv-section" aria-labelledby="tv-browse-heading">
              <div className="tv-section-header">
                <h2 id="tv-browse-heading">Browse by Category</h2>
              </div>
              <div className="tv-genre-grid tv-genre-grid--compact">
                {browseCategories.slice(0, 6).map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`tv-genre-card${selectedCategory === category.label ? ' is-active' : ''}`}
                    onClick={() => handleCategorySelect(category.label)}
                  >
                    <span className="tv-genre-icon" aria-hidden="true">{category.icon}</span>
                    <strong>{category.label}</strong>
                    <span>{category.count.toLocaleString()} channels</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {regions.length > 0 ? (
            <section className="tv-section" aria-labelledby="tv-regions-heading">
              <div className="tv-section-header">
                <h2 id="tv-regions-heading">Top Regions</h2>
              </div>
              <div className="tv-region-grid">
                {regions.map((region) => (
                  <button
                    key={region.id}
                    type="button"
                    className={`tv-region-card${selectedRegion === region.name ? ' is-active' : ''}`}
                    onClick={() => handleRegionSelect(region.name)}
                  >
                    <span className="tv-region-code" aria-hidden="true">
                      {region.code ?? regionCode(region.name)}
                    </span>
                    <strong>{region.name}</strong>
                    <span>{region.count.toLocaleString()} channels</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="tv-section" aria-labelledby="tv-catalog-heading">
            <div className="tv-section-header">
              <h2 id="tv-catalog-heading">
                {selectedRegion
                  ? `Channels in ${selectedRegion}`
                  : selectedCategory
                    ? selectedCategory
                    : 'All Channels'}
              </h2>
              {catalogLoading && catalogChannels.length === 0 ? (
                <span className="tv-section-meta">Updating…</span>
              ) : null}
            </div>

            {showEmpty ? (
              <div className="tv-status tv-status--empty" role="status">
                <p>
                  {catalogError
                    ? catalogError
                    : 'No TV channels are available in this section yet.'}
                </p>
                {catalogError ? (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void retry()}>
                    Retry
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      handleFilterChange('all')
                      setSelectedCategory(null)
                      setSelectedRegion(null)
                    }}
                  >
                    Back to All Channels
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="tv-station-grid">
                  {catalogChannels.map((channel) => (
                    <ChannelCard
                      key={`catalog-${channel.id}`}
                      channel={channel}
                      tuning={tuningChannelId === channel.id}
                      isFavorite={favoriteIds.has(channel.id)}
                      onPlay={() => {
                        const queue = catalogChannels.length > 0 ? catalogChannels : [channel]
                        void playChannel(channel, queue, 'TV Channels')
                      }}
                      onToggleFavorite={() => handleToggleFavorite(channel.id)}
                      ArtworkImage={ArtworkImage}
                    />
                  ))}
                  {catalogLoading
                    ? Array.from({ length: 6 }, (_, index) => (
                        <ChannelSkeleton key={`skeleton-${index}`} />
                      ))
                    : null}
                </div>
                <div ref={loadMoreRef} className="tv-load-more-sentinel" aria-hidden="true" />
                {loadingMore ? (
                  <p className="tv-section-meta tv-section-meta--centered">Loading more channels…</p>
                ) : null}
              </>
            )}
          </section>
        </>
      ) : null}

      {activeTvChannelId && isPlaying ? (
        <p className="tv-now-playing-hint" role="status">
          A live channel is playing — use the right panel and footer player for controls.
        </p>
      ) : null}
    </div>
  )
})

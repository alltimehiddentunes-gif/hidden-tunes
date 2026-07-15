import { memo, useCallback, useMemo, useState, type ComponentType } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import type { RadioStationMeta, RadioTabId } from '../../lib/radio/types'
import { useRadioPageData } from '../../lib/radio/useRadioPageData'
import radioArtwork from '../../assets/section-headers/radio-headphones.png'
import { SectionHero } from '../SectionHero'

const RADIO_TABS: { id: RadioTabId; label: string }[] = [
  { id: 'all', label: 'All Stations' },
  { id: 'featured', label: 'Featured' },
  { id: 'music', label: 'Music' },
  { id: 'news', label: 'News' },
  { id: 'talk', label: 'Talk' },
  { id: 'sports', label: 'Sports' },
  { id: 'culture', label: 'Culture' },
  { id: 'moods', label: 'Moods' },
  { id: 'countries', label: 'Countries' },
]

const GENRE_ICONS: Record<string, string> = {
  pop: '★',
  rock: '🎸',
  'hip hop': '♛',
  'r&b': '♥',
  electronic: '🎧',
  jazz: '🎷',
}

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
}

type RadioPageProps = {
  query: string
  onPlayRadioStation: (
    station: RadioStationMeta,
    queue: RadioStationMeta[],
    startIndex: number,
    queueTitle: string,
  ) => void
  ArtworkImage: ComponentType<ArtworkImageProps>
}

function formatStationMeta(station: RadioStationMeta) {
  const parts = [
    station.country || station.countryCode,
    station.codec && station.bitrate ? `${station.codec} · ${station.bitrate}kbps` : null,
  ].filter(Boolean)
  return parts.join(' · ') || 'Live stream'
}

function StationCard({
  station,
  tuning,
  onPlay,
  ArtworkImage,
}: {
  station: RadioStationMeta
  tuning: boolean
  onPlay: () => void
  ArtworkImage: ComponentType<ArtworkImageProps>
}) {
  return (
    <article className="radio-station-card-v2">
      <button type="button" className="radio-station-card-v2-hit" onClick={onPlay} disabled={tuning}>
        <div className="radio-station-card-v2-art">
          <ArtworkImage
            src={station.artworkUrl}
            alt=""
            seed={station.id}
            label={station.name}
          />
          <span className="radio-live-badge">LIVE</span>
          <span className="radio-station-card-v2-play" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
        <div className="radio-station-card-v2-copy">
          <h3>{station.name}</h3>
          <p>{formatStationMeta(station)}</p>
        </div>
      </button>
    </article>
  )
}

export const RadioPage = memo(function RadioPage({
  query,
  onPlayRadioStation,
  ArtworkImage,
}: RadioPageProps) {
  const [activeTab, setActiveTab] = useState<RadioTabId>('all')
  const [tuningStationId, setTuningStationId] = useState<string | null>(null)
  const { currentTrack, isPlaying } = useDesktopPlayback()

  const {
    featuredStations,
    visibleStations,
    genreCards,
    countries,
    loading,
    stationsLoading,
    error,
    stationsError,
    selectedCountry,
    setSelectedCountry,
    selectedGenre,
    setSelectedGenre,
    retry,
  } = useRadioPageData(activeTab, query)

  const activeRadioStationId = useMemo(() => {
    if (!currentTrack?.id.startsWith('radio-')) return null
    return currentTrack.id.slice('radio-'.length)
  }, [currentTrack?.id])

  const playStation = useCallback(
    async (station: RadioStationMeta, queue: RadioStationMeta[], queueTitle: string) => {
      const startIndex = Math.max(0, queue.findIndex((entry) => entry.id === station.id))
      setTuningStationId(station.id)
      try {
        onPlayRadioStation(station, queue, startIndex, queueTitle)
      } finally {
        window.setTimeout(() => setTuningStationId(null), 600)
      }
    },
    [onPlayRadioStation],
  )

  const handleFeaturedPlay = useCallback(
    (station: RadioStationMeta) => {
      const queue = featuredStations.length > 0 ? featuredStations : [station]
      void playStation(station, queue, 'Featured Stations')
    },
    [featuredStations, playStation],
  )

  const handleBrowsePlay = useCallback(
    (station: RadioStationMeta) => {
      const queue = visibleStations.length > 0 ? visibleStations : [station]
      const label = RADIO_TABS.find((tab) => tab.id === activeTab)?.label ?? 'Radio'
      void playStation(station, queue, label)
    },
    [activeTab, playStation, visibleStations],
  )

  const showEmpty =
    !loading
    && !stationsLoading
    && visibleStations.length === 0
    && !error

  return (
    <div className="radio-destination">
      <SectionHero
        title="Radio"
        subtitle="Tuned to the world. Always on."
        artwork={radioArtwork}
        artworkAlt=""
        objectPosition="60% center"
        titleId="radio-page-heading"
      />

      <div className="radio-tabs" role="tablist" aria-label="Radio categories">
        {RADIO_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`radio-tab${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <section className="radio-status radio-status--error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void retry()}>
            Retry
          </button>
        </section>
      ) : loading ? (
        <section className="radio-status" aria-busy="true">
          <p>Loading radio catalog…</p>
        </section>
      ) : null}

      {!error && !loading ? (
        <>
      {featuredStations.length > 0 && activeTab !== 'countries' ? (
        <section className="radio-section" aria-labelledby="radio-featured-heading">
          <div className="radio-section-header">
            <h2 id="radio-featured-heading">Featured Stations</h2>
          </div>
          <div className="radio-station-rail">
            {featuredStations.map((station) => (
              <StationCard
                key={station.id}
                station={station}
                tuning={tuningStationId === station.id}
                onPlay={() => handleFeaturedPlay(station)}
                ArtworkImage={ArtworkImage}
              />
            ))}
          </div>
        </section>
      ) : null}

      {genreCards.length > 0 && activeTab !== 'countries' ? (
        <section className="radio-section" aria-labelledby="radio-genre-heading">
          <div className="radio-section-header">
            <h2 id="radio-genre-heading">Browse by Genre</h2>
          </div>
          <div className="radio-genre-grid">
            {genreCards.map((genre) => (
              <button
                key={genre.id}
                type="button"
                className={`radio-genre-card${selectedGenre === genre.id ? ' is-active' : ''}`}
                onClick={() => {
                  setSelectedGenre(selectedGenre === genre.id ? null : genre.id)
                  setActiveTab('all')
                }}
              >
                <span className="radio-genre-icon" aria-hidden="true">
                  {GENRE_ICONS[genre.id.toLowerCase()] ?? '◎'}
                </span>
                <strong>{genre.label}</strong>
                <span>{genre.count.toLocaleString()} stations</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {countries.length > 0 ? (
        <section className="radio-section" aria-labelledby="radio-countries-heading">
          <div className="radio-section-header">
            <h2 id="radio-countries-heading">Top Countries</h2>
          </div>
          <div className="radio-country-grid">
            {countries.map((country) => (
              <button
                key={country.id}
                type="button"
                className={`radio-country-card${selectedCountry === country.id ? ' is-active' : ''}`}
                onClick={() => {
                  setSelectedCountry(selectedCountry === country.id ? null : country.id)
                  setActiveTab('countries')
                }}
              >
                <span className="radio-country-code" aria-hidden="true">
                  {country.code ?? country.id.slice(0, 2).toUpperCase()}
                </span>
                <strong>{country.name}</strong>
                <span>{country.count.toLocaleString()} stations</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="radio-section" aria-labelledby="radio-browse-heading">
        <div className="radio-section-header">
          <h2 id="radio-browse-heading">
            {activeTab === 'countries' && selectedCountry
              ? 'Stations by Country'
              : 'Stations'}
          </h2>
          {stationsLoading ? <span className="radio-section-meta">Updating…</span> : null}
        </div>

        {showEmpty ? (
          <div className="radio-status radio-status--empty" role="status">
            <p>
              {stationsError
                ? stationsError
                : 'No playable stations match this view right now.'}
            </p>
            {stationsError ? (
              <button type="button" className="btn-secondary btn-sm" onClick={() => void retry()}>
                Retry
              </button>
            ) : null}
          </div>
        ) : (
          <div className="radio-station-grid">
            {visibleStations.map((station) => (
              <StationCard
                key={`browse-${station.id}`}
                station={station}
                tuning={tuningStationId === station.id}
                onPlay={() => handleBrowsePlay(station)}
                ArtworkImage={ArtworkImage}
              />
            ))}
          </div>
        )}
      </section>
        </>
      ) : null}

      {activeRadioStationId && isPlaying ? (
        <p className="radio-now-playing-hint" role="status">
          Now tuned to a live station — use the right rail and footer for queue controls.
        </p>
      ) : null}
    </div>
  )
})

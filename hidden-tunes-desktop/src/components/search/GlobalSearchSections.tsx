import { memo, type ComponentType, type ReactNode } from 'react'
import type { useGlobalDesktopSearch } from '../../lib/search/useGlobalDesktopSearch'
import type { RadioStationMeta } from '../../lib/radio/types'
import type { TvChannelMeta } from '../../lib/tv/types'

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
}

type GlobalSearchSectionsProps = {
  search: ReturnType<typeof useGlobalDesktopSearch>
  ArtworkImage: ComponentType<ArtworkImageProps>
  onNavigateNav: (navKey: string) => void
  onOpenPodcastShow?: (showId: string) => void
  onOpenAudiobook?: (bookId: string) => void
  onOpenMotivational?: (programId: string) => void
  onPlayRadio?: (station: RadioStationMeta) => void
  onPlayTv?: (channel: TvChannelMeta) => void
  Chevron: ComponentType<{ className?: string }>
}

function Section({
  id,
  title,
  viewAllNav,
  onNavigateNav,
  loading,
  error,
  children,
  count,
}: {
  id: string
  title: string
  viewAllNav?: string
  onNavigateNav: (navKey: string) => void
  loading: boolean
  error: string | null
  children: ReactNode
  count: number
}) {
  if (!loading && !error && count === 0) return null
  return (
    <section className="psd-search-songs-panel ht-global-search-section" aria-labelledby={id}>
      <header className="psd-search-section-header">
        <h2 id={id}>{title}</h2>
        {viewAllNav ? (
          <button type="button" className="psd-search-view-all" onClick={() => onNavigateNav(viewAllNav)}>
            View all
          </button>
        ) : null}
      </header>
      {loading ? <p className="ht-global-search-status">Searching…</p> : null}
      {error ? <p className="ht-global-search-status ht-global-search-status--error">{error}</p> : null}
      {!loading && count > 0 ? <div className="psd-search-side-card">{children}</div> : null}
    </section>
  )
}

export const GlobalSearchSections = memo(function GlobalSearchSections({
  search,
  ArtworkImage,
  onNavigateNav,
  onOpenPodcastShow,
  onOpenAudiobook,
  onOpenMotivational,
  onPlayRadio,
  onPlayTv,
  Chevron,
}: GlobalSearchSectionsProps) {
  if (!search.active) return null

  return (
    <div className="ht-global-search-groups">
      <Section
        id="search-radio-heading"
        title="Radio"
        viewAllNav="radio"
        onNavigateNav={onNavigateNav}
        loading={search.radio.loading}
        error={search.radio.error}
        count={search.radio.items.length}
      >
        {search.radio.items.map((station) => (
          <div
            key={station.id}
            className="psd-search-side-row psd-search-side-row--actions"
          >
            <button type="button" className="psd-search-result-body" onClick={() => onNavigateNav('radio')}>
              <span className="psd-search-side-art">
                <ArtworkImage src={station.artworkUrl} alt="" seed={station.id} label={station.name} />
              </span>
              <span className="psd-search-side-copy">
                <strong>{station.name}</strong>
                <span>{station.country || 'Radio'}</span>
              </span>
            </button>
            <button
              type="button"
              className="psd-search-result-play"
              aria-label={`Play ${station.name}`}
              onClick={(event) => {
                event.stopPropagation()
                onPlayRadio?.(station)
              }}
            >Play</button>
          </div>
        ))}
      </Section>

      <Section
        id="search-podcasts-heading"
        title="Podcasts"
        viewAllNav="podcasts"
        onNavigateNav={onNavigateNav}
        loading={search.podcastShows.loading}
        error={search.podcastShows.error}
        count={search.podcastShows.items.length}
      >
        {search.podcastShows.items.map((show) => (
          <button
            key={show.id}
            type="button"
            className="psd-search-side-row"
            onClick={() => onOpenPodcastShow?.(show.id)}
          >
            <span className="psd-search-side-art">
              <ArtworkImage src={show.artworkUrl} alt="" seed={show.id} label={show.title} />
            </span>
            <span className="psd-search-side-copy">
              <strong>{show.title}</strong>
              <span>{show.hostName || 'Podcast show'}</span>
            </span>
            <Chevron className="psd-search-side-chevron" />
          </button>
        ))}
      </Section>

      <Section
        id="search-audiobooks-heading"
        title="Audiobooks"
        viewAllNav="audiobooks"
        onNavigateNav={onNavigateNav}
        loading={search.audiobooks.loading}
        error={search.audiobooks.error}
        count={search.audiobooks.items.length}
      >
        {search.audiobooks.items.map((book) => (
          <button
            key={book.id}
            type="button"
            className="psd-search-side-row"
            onClick={() => onOpenAudiobook?.(book.id)}
          >
            <span className="psd-search-side-art">
              <ArtworkImage src={book.coverUrl} alt="" seed={book.id} label={book.title} />
            </span>
            <span className="psd-search-side-copy">
              <strong>{book.title}</strong>
              <span>{book.authorName || 'Audiobook'}</span>
            </span>
            <Chevron className="psd-search-side-chevron" />
          </button>
        ))}
      </Section>

      <Section
        id="search-tv-heading"
        title="TV"
        viewAllNav="tv"
        onNavigateNav={onNavigateNav}
        loading={search.tv.loading}
        error={search.tv.error}
        count={search.tv.items.length}
      >
        {search.tv.items.map((channel) => (
          <div
            key={channel.id}
            className="psd-search-side-row psd-search-side-row--actions"
          >
            <button type="button" className="psd-search-result-body" onClick={() => onNavigateNav('tv')}>
              <span className="psd-search-side-art">
                <ArtworkImage src={channel.artworkUrl} alt="" seed={channel.id} label={channel.title} />
              </span>
              <span className="psd-search-side-copy">
                <strong>{channel.title}</strong>
                <span>{channel.channelName || 'TV'}</span>
              </span>
            </button>
            <button
              type="button"
              className="psd-search-result-play"
              aria-label={`Play ${channel.title}`}
              onClick={(event) => {
                event.stopPropagation()
                onPlayTv?.(channel)
              }}
            >Play</button>
          </div>
        ))}
      </Section>

      <Section
        id="search-sports-heading"
        title="Sports"
        viewAllNav="sports"
        onNavigateNav={onNavigateNav}
        loading={search.sports.loading}
        error={search.sports.error}
        count={search.sports.items.length}
      >
        {search.sports.items.map((fixture) => (
          <button
            key={fixture.id}
            type="button"
            className="psd-search-side-row"
            onClick={() => onNavigateNav('sports')}
          >
            <span className="psd-search-side-art">
              <ArtworkImage
                src={fixture.artwork}
                alt=""
                seed={fixture.id}
                label={fixture.title || fixture.homeTeam || 'Sports'}
              />
            </span>
            <span className="psd-search-side-copy">
              <strong>
                {fixture.title
                  || (fixture.homeTeam && fixture.awayTeam
                    ? `${fixture.homeTeam} vs ${fixture.awayTeam}`
                    : 'Sports fixture')}
              </strong>
              <span>{[fixture.league, fixture.sport, fixture.status].filter(Boolean).join(' · ') || 'Sports'}</span>
            </span>
            <Chevron className="psd-search-side-chevron" />
          </button>
        ))}
      </Section>

      <Section
        id="search-motivationals-heading"
        title="Motivationals"
        viewAllNav="motivationals"
        onNavigateNav={onNavigateNav}
        loading={search.motivationals.loading}
        error={search.motivationals.error}
        count={search.motivationals.items.length}
      >
        {search.motivationals.items.map((session) => (
          <button
            key={session.id}
            type="button"
            className="psd-search-side-row"
            onClick={() => onOpenMotivational?.(session.programId || session.id)}
          >
            <span className="psd-search-side-art">
              <ArtworkImage src={session.artworkUrl} alt="" seed={session.id} label={session.title} />
            </span>
            <span className="psd-search-side-copy">
              <strong>{session.title}</strong>
              <span>{session.speakerName || 'Motivational'}</span>
            </span>
            <Chevron className="psd-search-side-chevron" />
          </button>
        ))}
      </Section>

      <Section
        id="search-library-heading"
        title="Library"
        viewAllNav="library"
        onNavigateNav={onNavigateNav}
        loading={false}
        error={null}
        count={search.library.items.length}
      >
        {search.library.items.map((item) => (
          <button
            key={`${item.type}:${item.id}`}
            type="button"
            className="psd-search-side-row"
            onClick={() => onNavigateNav('library')}
          >
            <span className="psd-search-side-art">
              <ArtworkImage src={item.artwork ?? null} alt="" seed={item.id} label={item.title} />
            </span>
            <span className="psd-search-side-copy">
              <strong>{item.title}</strong>
              <span>{item.type}</span>
            </span>
            <Chevron className="psd-search-side-chevron" />
          </button>
        ))}
      </Section>

      <Section
        id="search-playlists-heading"
        title="Playlists"
        viewAllNav="playlists"
        onNavigateNav={onNavigateNav}
        loading={false}
        error={null}
        count={search.playlists.items.length}
      >
        {search.playlists.items.map((playlist) => (
          <button
            key={playlist.id}
            type="button"
            className="psd-search-side-row"
            onClick={() => onNavigateNav('playlists')}
          >
            <span className="psd-search-side-copy">
              <strong>{playlist.title}</strong>
              <span>{playlist.items.length} items</span>
            </span>
            <Chevron className="psd-search-side-chevron" />
          </button>
        ))}
      </Section>

      <Section
        id="search-downloads-heading"
        title="Downloads"
        viewAllNav="downloads"
        onNavigateNav={onNavigateNav}
        loading={false}
        error={null}
        count={search.downloads.items.length}
      >
        {search.downloads.items.map((item) => (
          <button
            key={item.downloadId}
            type="button"
            className="psd-search-side-row"
            onClick={() => onNavigateNav('downloads')}
          >
            <span className="psd-search-side-copy">
              <strong>{item.title}</strong>
              <span>{item.type}</span>
            </span>
            <Chevron className="psd-search-side-chevron" />
          </button>
        ))}
      </Section>
    </div>
  )
})

import { memo, useState, type ComponentType, type ReactNode } from 'react'
import type {
  GlobalSearchFamilyId,
  GlobalSearchFamilyState,
  useGlobalDesktopSearch,
} from '../../lib/search/useGlobalDesktopSearch'
import type { RadioStationMeta } from '../../lib/radio/types'
import type { TvChannelMeta } from '../../lib/tv/types'

const FAMILY_PREVIEW_LIMIT = 8

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

function formatFamilyTitle(label: string, total: number | null) {
  if (typeof total === 'number' && Number.isFinite(total) && total > 0) {
    return `${label} · ${total}`
  }
  return label
}

function seeAllLabel(noun: string, total: number | null, hasMore: boolean, loaded: number) {
  if (typeof total === 'number' && Number.isFinite(total) && total > loaded) {
    return `See all ${total} ${noun}`
  }
  if (hasMore) return `See more ${noun}`
  if (loaded > FAMILY_PREVIEW_LIMIT) return `See all ${loaded} ${noun}`
  return null
}

function Section({
  id,
  title,
  loading,
  loadingMore,
  error,
  loadMoreError,
  children,
  count,
  seeAll,
  onSeeAll,
  hasMore,
  onLoadMore,
  expanded,
}: {
  id: string
  title: string
  loading: boolean
  loadingMore: boolean
  error: string | null
  loadMoreError: string | null
  children: ReactNode
  count: number
  seeAll: string | null
  onSeeAll?: () => void
  hasMore: boolean
  onLoadMore?: () => void
  expanded: boolean
}) {
  if (!loading && !error && count === 0) return null
  return (
    <section className="psd-search-songs-panel ht-global-search-section" aria-labelledby={id}>
      <header className="psd-search-section-header">
        <h2 id={id}>{title}</h2>
        {!expanded && seeAll && onSeeAll ? (
          <button type="button" className="psd-search-view-all" onClick={onSeeAll}>
            {seeAll}
          </button>
        ) : null}
      </header>
      {loading && count === 0 ? <p className="ht-global-search-status">Searching…</p> : null}
      {error && count === 0 ? (
        <p className="ht-global-search-status ht-global-search-status--error">{error}</p>
      ) : null}
      {count > 0 ? <div className="psd-search-side-card">{children}</div> : null}
      {expanded && hasMore ? (
        <button
          type="button"
          className="catalog-show-more"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? 'Loading more…' : 'Load more'}
        </button>
      ) : null}
      {expanded && loadMoreError ? (
        <div className="psd-search-error" role="status">
          <p>{loadMoreError}</p>
          <button type="button" className="btn-secondary btn-sm" onClick={onLoadMore}>
            Retry
          </button>
        </div>
      ) : null}
    </section>
  )
}

function previewOrAll<T>(items: T[], expanded: boolean) {
  return expanded ? items : items.slice(0, FAMILY_PREVIEW_LIMIT)
}

function familyMeta<T>(
  state: GlobalSearchFamilyState<T>,
  noun: string,
  expanded: boolean,
) {
  return {
    titleExtra: state.total,
    seeAll: expanded
      ? null
      : seeAllLabel(noun, state.total, state.hasMore, state.items.length),
    showLoadMore: expanded && state.hasMore,
  }
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
  const [expandedFamily, setExpandedFamily] = useState<GlobalSearchFamilyId | null>(null)

  if (!search.active) return null

  const expand = (family: GlobalSearchFamilyId) => {
    setExpandedFamily(family)
  }

  const radioExpanded = expandedFamily === 'radio'
  const podcastExpanded = expandedFamily === 'podcastShows'
  const audiobookExpanded = expandedFamily === 'audiobooks'
  const tvExpanded = expandedFamily === 'tv'
  const sportsExpanded = expandedFamily === 'sports'
  const motivationalExpanded = expandedFamily === 'motivationals'

  const radioItems = previewOrAll(search.radio.items, radioExpanded)
  const podcastItems = previewOrAll(search.podcastShows.items, podcastExpanded)
  const audiobookItems = previewOrAll(search.audiobooks.items, audiobookExpanded)
  const tvItems = previewOrAll(search.tv.items, tvExpanded)
  const sportsItems = previewOrAll(search.sports.items, sportsExpanded)
  const motivationalItems = previewOrAll(search.motivationals.items, motivationalExpanded)

  const radioMeta = familyMeta(search.radio, 'stations', radioExpanded)
  const podcastMeta = familyMeta(search.podcastShows, 'shows', podcastExpanded)
  const audiobookMeta = familyMeta(search.audiobooks, 'audiobooks', audiobookExpanded)
  const tvMeta = familyMeta(search.tv, 'channels', tvExpanded)
  const sportsMeta = familyMeta(search.sports, 'fixtures', sportsExpanded)
  const motivationalMeta = familyMeta(search.motivationals, 'sessions', motivationalExpanded)

  return (
    <div className="ht-global-search-groups">
      <Section
        id="search-radio-heading"
        title={formatFamilyTitle('Radio', search.radio.total)}
        loading={search.radio.loading}
        loadingMore={search.radio.loadingMore}
        error={search.radio.error}
        loadMoreError={search.radio.loadMoreError}
        count={radioItems.length}
        seeAll={radioMeta.seeAll}
        onSeeAll={() => expand('radio')}
        hasMore={search.radio.hasMore}
        onLoadMore={() => void search.loadMoreFamily('radio')}
        expanded={radioExpanded}
      >
        {radioItems.map((station) => (
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
        title={formatFamilyTitle('Podcasts', search.podcastShows.total)}
        loading={search.podcastShows.loading}
        loadingMore={search.podcastShows.loadingMore}
        error={search.podcastShows.error}
        loadMoreError={search.podcastShows.loadMoreError}
        count={podcastItems.length}
        seeAll={podcastMeta.seeAll}
        onSeeAll={() => expand('podcastShows')}
        hasMore={search.podcastShows.hasMore}
        onLoadMore={() => void search.loadMoreFamily('podcastShows')}
        expanded={podcastExpanded}
      >
        {podcastItems.map((show) => (
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
        title={formatFamilyTitle('Audiobooks', search.audiobooks.total)}
        loading={search.audiobooks.loading}
        loadingMore={search.audiobooks.loadingMore}
        error={search.audiobooks.error}
        loadMoreError={search.audiobooks.loadMoreError}
        count={audiobookItems.length}
        seeAll={audiobookMeta.seeAll}
        onSeeAll={() => expand('audiobooks')}
        hasMore={search.audiobooks.hasMore}
        onLoadMore={() => void search.loadMoreFamily('audiobooks')}
        expanded={audiobookExpanded}
      >
        {audiobookItems.map((book) => (
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
        title={formatFamilyTitle('TV', search.tv.total)}
        loading={search.tv.loading}
        loadingMore={search.tv.loadingMore}
        error={search.tv.error}
        loadMoreError={search.tv.loadMoreError}
        count={tvItems.length}
        seeAll={tvMeta.seeAll}
        onSeeAll={() => expand('tv')}
        hasMore={search.tv.hasMore}
        onLoadMore={() => void search.loadMoreFamily('tv')}
        expanded={tvExpanded}
      >
        {tvItems.map((channel) => (
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
        title={formatFamilyTitle('Sports', search.sports.total)}
        loading={search.sports.loading}
        loadingMore={search.sports.loadingMore}
        error={search.sports.error}
        loadMoreError={search.sports.loadMoreError}
        count={sportsItems.length}
        seeAll={sportsMeta.seeAll}
        onSeeAll={() => expand('sports')}
        hasMore={search.sports.hasMore}
        onLoadMore={() => void search.loadMoreFamily('sports')}
        expanded={sportsExpanded}
      >
        {sportsItems.map((fixture) => (
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
        title={formatFamilyTitle('Motivationals', search.motivationals.total)}
        loading={search.motivationals.loading}
        loadingMore={search.motivationals.loadingMore}
        error={search.motivationals.error}
        loadMoreError={search.motivationals.loadMoreError}
        count={motivationalItems.length}
        seeAll={motivationalMeta.seeAll}
        onSeeAll={() => expand('motivationals')}
        hasMore={search.motivationals.hasMore}
        onLoadMore={() => void search.loadMoreFamily('motivationals')}
        expanded={motivationalExpanded}
      >
        {motivationalItems.map((session) => (
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
        loading={false}
        loadingMore={false}
        error={null}
        loadMoreError={null}
        count={search.library.items.length}
        seeAll={null}
        hasMore={false}
        expanded={false}
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
        loading={false}
        loadingMore={false}
        error={null}
        loadMoreError={null}
        count={search.playlists.items.length}
        seeAll={null}
        hasMore={false}
        expanded={false}
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
        loading={false}
        loadingMore={false}
        error={null}
        loadMoreError={null}
        count={search.downloads.items.length}
        seeAll={null}
        hasMore={false}
        expanded={false}
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

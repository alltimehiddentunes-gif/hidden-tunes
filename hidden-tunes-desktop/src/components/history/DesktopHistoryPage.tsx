import { memo, useMemo, useState, type ComponentType } from 'react'
import {
  useDesktopHistory,
  type HistoryItemType,
} from '../../lib/history'

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
}

type DesktopHistoryPageProps = {
  query?: string
  onPlayHistoryItem: (item: {
    type: HistoryItemType
    id: string
    title: string
    subtitle?: string | null
    artwork?: string | null
    parentId?: string | null
    positionSeconds?: number | null
    isMature?: boolean
    contentRating?: string | null
    metadata?: Record<string, unknown> | null
  }) => void
  ArtworkImage: ComponentType<ArtworkImageProps>
}

const FILTERS: { id: 'all' | HistoryItemType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'song', label: 'Music' },
  { id: 'radio', label: 'Radio' },
  { id: 'podcast_episode', label: 'Podcasts' },
  { id: 'audiobook_chapter', label: 'Audiobooks' },
  { id: 'tv', label: 'TV' },
  { id: 'motivational', label: 'Motivationals' },
  { id: 'lecture', label: 'Lectures' },
]

function familyLabel(type: HistoryItemType) {
  switch (type) {
    case 'song':
      return 'Music'
    case 'radio':
      return 'Radio'
    case 'podcast_episode':
      return 'Podcast'
    case 'audiobook_chapter':
      return 'Audiobook'
    case 'tv':
      return 'TV'
    case 'motivational':
      return 'Motivational'
    case 'lecture':
      return 'Lecture'
    default:
      return 'Item'
  }
}

function formatPlayedAt(value: string) {
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toLocaleString()
}

export const DesktopHistoryPage = memo(function DesktopHistoryPage({
  query = '',
  onPlayHistoryItem,
  ArtworkImage,
}: DesktopHistoryPageProps) {
  const history = useDesktopHistory()
  const [filter, setFilter] = useState<'all' | HistoryItemType>('all')
  const [confirmClear, setConfirmClear] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return history.list(filter).filter((item) => {
      if (!q) return true
      return `${item.title} ${item.subtitle || ''}`.toLowerCase().includes(q)
    })
  }, [filter, history, query])

  const continueItems = history.continueListening

  return (
    <div className="ht-history-destination">
      <header className="ht-history-header">
        <div>
          <h1>History</h1>
          <p>Recently played across media on this device. Separate from Library, Downloads, and Playlists.</p>
        </div>
        <div className="ht-history-header-actions">
          {confirmClear ? (
            <>
                <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  history.clearAll()
                  setConfirmClear(false)
                }}
              >
                Confirm clear all
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmClear(true)}>
              Clear all
            </button>
          )}
          {filter !== 'all' ? (
            <button type="button" className="btn-ghost btn-sm" onClick={() => history.clearType(filter)}>
              Clear {familyLabel(filter)}
            </button>
          ) : null}
        </div>
      </header>

      {continueItems.length > 0 ? (
        <section className="ht-history-continue" aria-labelledby="ht-continue-heading">
          <h2 id="ht-continue-heading">Continue listening</h2>
          <div className="ht-history-list">
            {continueItems.slice(0, 8).map((item) => (
              <article key={`continue:${history.itemKey(item)}`} className="ht-history-row" data-history-type={item.type}>
                <span className="ht-history-art">
                  <ArtworkImage src={item.artwork ?? null} alt="" seed={item.id} label={item.title} />
                </span>
                <div className="ht-history-copy">
                  <span className="ht-history-type">{familyLabel(item.type)}</span>
                  <strong>{item.title}</strong>
                  <span>{item.subtitle || familyLabel(item.type)}</span>
                </div>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => onPlayHistoryItem(item)}
                >
                  Resume
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="ht-history-tabs" role="tablist" aria-label="History filters">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={filter === entry.id}
            className={`ht-history-tab${filter === entry.id ? ' is-active' : ''}`}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="ht-history-empty catalog-empty">
          <h2>No history yet</h2>
          <p>Play music, podcasts, radio, TV, and more to build your recent history.</p>
        </div>
      ) : (
        <div className="ht-history-list">
          {filtered.slice(0, 200).map((item) => (
            <article key={history.itemKey(item)} className="ht-history-row" data-history-type={item.type}>
              <span className="ht-history-art">
                <ArtworkImage src={item.artwork ?? null} alt="" seed={item.id} label={item.title} />
              </span>
              <div className="ht-history-copy">
                <span className="ht-history-type">{familyLabel(item.type)}</span>
                <strong>{item.title}</strong>
                <span>{item.subtitle || familyLabel(item.type)}</span>
                <span className="ht-history-played">{formatPlayedAt(item.playedAt)}</span>
              </div>
              <div className="ht-history-actions">
                <button type="button" className="btn-secondary btn-sm" onClick={() => onPlayHistoryItem(item)}>
                  Play
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => history.remove(item.type, item.id)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
})

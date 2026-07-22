import { memo, useMemo, useState, type ComponentType } from 'react'
import type { ApiSong } from '../../lib/api'
import { isMusicCatalogSong } from '../../lib/home/isMusicCatalogSong'
import {
  playlistItemKey,
  playlistItemsToQueue,
  useDesktopPlaylists,
  type DesktopPlaylist,
  type PlaylistItemType,
} from '../../lib/playlists'
import { useDesktopLibrary } from '../../lib/library/useDesktopLibrary'

type ArtworkImageProps = {
  src: string | null
  alt: string
  seed: string
  label: string
}

type DesktopPlaylistsPageProps = {
  songs: ApiSong[]
  songsById: Map<string, ApiSong>
  onPlayQueue: (songs: ApiSong[], startIndex: number, queueTitle: string) => void
  ArtworkImage: ComponentType<ArtworkImageProps>
}

function familyLabel(type: PlaylistItemType) {
  switch (type) {
    case 'song':
      return 'Music'
    case 'podcast_episode':
      return 'Podcast'
    case 'motivational':
      return 'Motivational'
    case 'lecture':
      return 'Lecture'
    case 'audiobook_chapter':
      return 'Audiobook'
    default:
      return 'Item'
  }
}

function PlaylistListCard({
  playlist,
  onOpen,
  onDelete,
}: {
  playlist: DesktopPlaylist
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <article className="ht-playlists-card">
      <button type="button" className="ht-playlists-card-main" onClick={onOpen}>
        <strong>{playlist.title}</strong>
        <span>{playlist.items.length} items</span>
      </button>
      <button type="button" className="btn-ghost btn-sm" onClick={onDelete}>
        Delete
      </button>
    </article>
  )
}

export const DesktopPlaylistsPage = memo(function DesktopPlaylistsPage({
  songs,
  songsById,
  onPlayQueue,
  ArtworkImage,
}: DesktopPlaylistsPageProps) {
  const playlists = useDesktopPlaylists()
  const library = useDesktopLibrary()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [addQuery, setAddQuery] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const active = activeId ? playlists.get(activeId) : null

  const songCandidates = useMemo(() => {
    const q = addQuery.trim().toLowerCase()
    return songs
      .filter((song) => isMusicCatalogSong(song))
      .filter((song) => {
        if (!q) return true
        return `${song.title} ${song.artist}`.toLowerCase().includes(q)
      })
      .slice(0, 24)
  }, [addQuery, songs])

  const libraryAddCandidates = useMemo(() => {
    return library.items
      .filter((item) => item.type === 'song' || item.type === 'podcast_episode')
      .slice(0, 24)
  }, [library.items])

  const create = () => {
    const created = playlists.create(draftTitle.trim() || 'New playlist')
    setDraftTitle('')
    setActiveId(created.id)
    setRenameValue(created.title)
    setActionError(null)
  }

  const playAll = () => {
    if (!active || active.items.length === 0) return
    const queue = playlistItemsToQueue(active.items, songsById)
    onPlayQueue(queue, 0, active.title)
  }

  const addSong = (song: ApiSong) => {
    if (!active) return
    const result = playlists.addItem(active.id, {
      type: 'song',
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      artwork: song.artwork,
      duration: song.durationSeconds,
      subtitle: song.artist,
      addedAt: new Date().toISOString(),
    })
    if (result.duplicate) setActionError('That item is already in this playlist.')
    else setActionError(null)
  }

  const addLibraryItem = (item: {
    type: string
    id: string
    title: string
    subtitle?: string | null
    artwork?: string | null
    artist?: string | null
    showId?: string | null
    showTitle?: string | null
    duration?: number | null
  }) => {
    if (!active) return
    if (item.type === 'song') {
      playlists.addItem(active.id, {
        type: 'song',
        id: item.id,
        title: item.title,
        artist: item.artist ?? item.subtitle ?? null,
        artwork: item.artwork ?? null,
        duration: item.duration ?? null,
        subtitle: item.subtitle ?? item.artist ?? null,
        addedAt: new Date().toISOString(),
      })
      return
    }
    if (item.type === 'podcast_episode') {
      playlists.addItem(active.id, {
        type: 'podcast_episode',
        id: item.id,
        title: item.title,
        showId: item.showId ?? null,
        showTitle: item.showTitle ?? item.subtitle ?? null,
        parentId: item.showId ?? null,
        artwork: item.artwork ?? null,
        subtitle: item.showTitle ?? item.subtitle ?? null,
        duration: item.duration ?? null,
        addedAt: new Date().toISOString(),
      })
      return
    }
    if (item.type === 'motivational') {
      playlists.addItem(active.id, {
        type: 'motivational',
        id: item.id,
        title: item.title,
        programId: item.id,
        parentId: item.id,
        artwork: item.artwork ?? null,
        subtitle: item.subtitle ?? null,
        addedAt: new Date().toISOString(),
      })
      return
    }
    if (item.type === 'lecture') {
      playlists.addItem(active.id, {
        type: 'lecture',
        id: item.id,
        title: item.title,
        seriesId: item.id,
        parentId: item.id,
        artwork: item.artwork ?? null,
        subtitle: item.subtitle ?? null,
        addedAt: new Date().toISOString(),
      })
    }
  }

  if (active) {
    return (
      <div className="ht-playlists-destination">
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => {
            setActiveId(null)
            setActionError(null)
          }}
        >
          Back to playlists
        </button>

        <header className="ht-playlists-detail-header">
          <div>
            <p className="ht-playlists-eyebrow">Your playlist</p>
            <h1>{active.title}</h1>
            <p>{active.items.length} items · Favorites and downloads stay separate</p>
          </div>
          <div className="ht-playlists-detail-actions">
            <button type="button" className="btn-primary btn-sm" disabled={active.items.length === 0} onClick={playAll}>
              Play
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                const next = playlists.rename(active.id, renameValue || active.title)
                if (!next) setActionError('Enter a playlist name.')
                else setActionError(null)
              }}
            >
              Save name
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                playlists.remove(active.id)
                setActiveId(null)
              }}
            >
              Delete playlist
            </button>
          </div>
        </header>

        <label className="ht-playlists-rename">
          <span>Name</span>
          <input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            aria-label="Playlist name"
          />
        </label>

        {actionError ? (
          <div className="ht-playlists-error" role="alert">
            {actionError}
          </div>
        ) : null}

        <section className="ht-playlists-items" aria-label="Playlist items">
          {active.items.length === 0 ? (
            <div className="ht-playlists-empty catalog-empty">
              <h2>No items yet</h2>
              <p>Add music from search below, or save Library items of supported audio types.</p>
            </div>
          ) : (
            <ul className="ht-playlists-item-list">
              {active.items.map((item, index) => (
                <li key={playlistItemKey(item)} className="ht-playlists-item-row" data-playlist-type={item.type}>
                  <span className="ht-playlists-item-art">
                    <ArtworkImage src={item.artwork ?? null} alt="" seed={item.id} label={item.title} />
                  </span>
                  <div className="ht-playlists-item-copy">
                    <span className="ht-playlists-item-type">{familyLabel(item.type)}</span>
                    <strong>{item.title}</strong>
                    <span>{item.subtitle || familyLabel(item.type)}</span>
                  </div>
                  <div className="ht-playlists-item-actions">
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      disabled={index === 0}
                      onClick={() => playlists.reorder(active.id, index, index - 1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      disabled={index >= active.items.length - 1}
                      onClick={() => playlists.reorder(active.id, index, index + 1)}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() =>
                        onPlayQueue(playlistItemsToQueue(active.items, songsById), index, active.title)
                      }
                    >
                      Play
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => playlists.removeItem(active.id, item.type, item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ht-playlists-add" aria-labelledby="ht-playlist-add-heading">
          <h2 id="ht-playlist-add-heading">Add music</h2>
          <input
            type="search"
            value={addQuery}
            onChange={(event) => setAddQuery(event.target.value)}
            placeholder="Search catalog songs"
            aria-label="Search catalog songs to add"
          />
          <div className="ht-playlists-add-list">
            {songCandidates.map((song) => (
              <button
                key={song.id}
                type="button"
                className="ht-playlists-add-row"
                onClick={() => addSong(song)}
              >
                <span>{song.title}</span>
                <span>{song.artist}</span>
                <span>Add</span>
              </button>
            ))}
          </div>
        </section>

        {libraryAddCandidates.length > 0 ? (
          <section className="ht-playlists-add" aria-labelledby="ht-playlist-lib-heading">
            <h2 id="ht-playlist-lib-heading">Add from Library</h2>
            <p className="ht-playlists-hint">
              Supported audio favorites only. Adding here does not remove the Library favorite.
            </p>
            <div className="ht-playlists-add-list">
              {libraryAddCandidates.map((item) => (
                <button
                  key={`${item.type}:${item.id}`}
                  type="button"
                  className="ht-playlists-add-row"
                  onClick={() => addLibraryItem(item)}
                >
                  <span>{item.title}</span>
                  <span>{familyLabel(item.type as PlaylistItemType)}</span>
                  <span>Add</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    )
  }

  return (
    <div className="ht-playlists-destination">
      <header className="ht-playlists-header">
        <h1>Playlists</h1>
        <p>Your collections on this device. Separate from Library favorites and Downloads.</p>
      </header>

      <form
        className="ht-playlists-create"
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
        <input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          placeholder="Playlist name"
          aria-label="New playlist name"
        />
        <button type="submit" className="btn-primary btn-sm">
          Create playlist
        </button>
      </form>

      {playlists.playlists.length === 0 ? (
        <div className="ht-playlists-empty catalog-empty">
          <h2>No playlists yet</h2>
          <p>Create a playlist to collect music and other supported audio items.</p>
        </div>
      ) : (
        <div className="ht-playlists-grid">
          {playlists.playlists.map((playlist) => (
            <PlaylistListCard
              key={playlist.id}
              playlist={playlist}
              onOpen={() => {
                setActiveId(playlist.id)
                setRenameValue(playlist.title)
                setActionError(null)
              }}
              onDelete={() => playlists.remove(playlist.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
})

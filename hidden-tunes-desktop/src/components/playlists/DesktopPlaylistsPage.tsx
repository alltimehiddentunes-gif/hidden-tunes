import { memo, useMemo, useState, type ComponentType } from 'react'
import type { ApiSong } from '../../lib/api'
import { isMusicCatalogSong } from '../../lib/home/isMusicCatalogSong'
import {
  playlistItemKey,
  playlistItemsToQueue,
  useDesktopPlaylists,
  type DesktopPlaylist,
  type DesktopPlaylistSongItem,
} from '../../lib/playlists'
import { useDesktopLibrary } from '../../lib/library/useDesktopLibrary'

type ArtworkImageProps = { src: string | null; alt: string; seed: string; label: string }
type Props = {
  songs: ApiSong[]
  songsById: Map<string, ApiSong>
  onPlayQueue: (songs: ApiSong[], startIndex: number, queueTitle: string) => void
  ArtworkImage: ComponentType<ArtworkImageProps>
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function PlaylistArtwork({ playlist, ArtworkImage }: { playlist: DesktopPlaylist; ArtworkImage: Props['ArtworkImage'] }) {
  const covers = playlist.items.map((item) => item.artwork).filter((value): value is string => Boolean(value)).slice(0, 4)
  return (
    <div className={`ht-playlist-collage ht-playlist-collage--${covers.length || 'empty'}`} aria-hidden="true">
      {covers.length ? covers.map((cover, index) => (
        <ArtworkImage key={`${cover}:${index}`} src={cover} alt="" seed={`${playlist.id}:${index}`} label={playlist.title} />
      )) : <span>♫</span>}
    </div>
  )
}

function songToItem(song: ApiSong): DesktopPlaylistSongItem {
  return {
    type: 'song', id: song.id, title: song.title, artist: song.artist, album: song.album,
    artwork: song.artwork, duration: song.durationSeconds, subtitle: song.artist,
    addedAt: new Date().toISOString(),
  }
}

export const DesktopPlaylistsPage = memo(function DesktopPlaylistsPage({ songs, songsById, onPlayQueue, ArtworkImage }: Props) {
  const playlists = useDesktopPlaylists()
  const library = useDesktopLibrary()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overviewQuery, setOverviewQuery] = useState('')
  const [sort, setSort] = useState<'updated' | 'name'>('updated')
  const [showCreate, setShowCreate] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [addSource, setAddSource] = useState<'search' | 'favorites'>('search')
  const [addQuery, setAddQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const active = activeId ? playlists.get(activeId) : null

  const filteredPlaylists = useMemo(() => {
    const q = overviewQuery.trim().toLowerCase()
    return playlists.playlists.filter((p) => !q || p.title.toLowerCase().includes(q)).sort((a, b) => (
      sort === 'name' ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)
    ))
  }, [overviewQuery, playlists.playlists, sort])

  const candidates = useMemo(() => {
    const q = addQuery.trim().toLowerCase()
    if (addSource === 'favorites') {
      return library.items.filter((item) => item.type === 'song').filter((item) => (
        !q || `${item.title} ${item.artist ?? ''} ${item.album ?? ''}`.toLowerCase().includes(q)
      )).map((item) => ({
        type: 'song' as const, id: item.id, title: item.title, artist: item.artist ?? item.subtitle ?? '',
        album: item.album ?? '', artwork: item.artwork ?? null, duration: item.duration ?? null,
        subtitle: item.artist ?? item.subtitle ?? null, addedAt: new Date().toISOString(),
      }))
    }
    return songs.filter(isMusicCatalogSong).filter((song) => (
      !q || `${song.title} ${song.artist} ${song.album} ${song.genre ?? ''} ${song.mood ?? ''}`.toLowerCase().includes(q)
    )).slice(0, 100).map(songToItem)
  }, [addQuery, addSource, library.items, songs])

  const existing = useMemo(() => new Set(active?.items.map(playlistItemKey) ?? []), [active])
  const selectable = candidates.filter((item) => !existing.has(playlistItemKey(item)))
  const selectedItems = candidates.filter((item) => selected.has(playlistItemKey(item)) && !existing.has(playlistItemKey(item)))

  const openPlaylist = (playlist: DesktopPlaylist, immediatelyAdd = false) => {
    setActiveId(playlist.id); setRenameValue(playlist.title); setMessage(null); setSelected(new Set()); setAddOpen(immediatelyAdd)
  }
  const create = () => {
    const title = draftTitle.trim()
    if (!title) { setMessage('Enter a playlist name.'); return }
    const created = playlists.create(title.slice(0, 100), draftDescription.trim().slice(0, 500) || null)
    setDraftTitle(''); setDraftDescription(''); setShowCreate(false); openPlaylist(created, true)
  }
  const addSelected = () => {
    if (!active || selectedItems.length === 0) return
    const result = playlists.addItems(active.id, selectedItems)
    setSelected(new Set())
    setMessage(`${result.added} song${result.added === 1 ? '' : 's'} added${result.duplicates ? ` · ${result.duplicates} already added` : ''}.`)
  }
  const play = (shuffle = false) => {
    if (!active) return
    const queue = playlistItemsToQueue(active.items, songsById)
    if (!queue.length) return
    if (shuffle) queue.sort(() => Math.random() - 0.5)
    onPlayQueue(queue, 0, active.title)
  }

  if (!active) return (
    <main className="ht-playlists-destination ht-playlists-premium">
      <header className="ht-playlists-overview-head">
        <div><p className="ht-playlists-eyebrow">YOUR COLLECTION</p><h1>Your Playlists</h1><p>Build a soundtrack for every moment.</p><span>{playlists.count} playlist{playlists.count === 1 ? '' : 's'} · {playlists.playlists.reduce((n, p) => n + p.items.length, 0)} saved songs</span></div>
        <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>+ Create Playlist</button>
      </header>
      <div className="ht-playlists-toolbar">
        <input type="search" value={overviewQuery} onChange={(e) => setOverviewQuery(e.target.value)} placeholder="Search your playlists" aria-label="Search your playlists" />
        <select value={sort} onChange={(e) => setSort(e.target.value as 'updated' | 'name')} aria-label="Sort playlists"><option value="updated">Recently updated</option><option value="name">Name</option></select>
      </div>
      {filteredPlaylists.length ? <div className="ht-playlists-grid">{filteredPlaylists.map((playlist) => (
        <article className="ht-playlist-premium-card" key={playlist.id}>
          <button type="button" className="ht-playlist-card-open" onClick={() => openPlaylist(playlist)}><PlaylistArtwork playlist={playlist} ArtworkImage={ArtworkImage} /><strong>{playlist.title}</strong><span>{playlist.items.length} songs</span></button>
          <button type="button" className="btn-ghost btn-sm" disabled={!playlist.items.length} onClick={() => { openPlaylist(playlist); setTimeout(() => { const q = playlistItemsToQueue(playlist.items, songsById); if (q.length) onPlayQueue(q, 0, playlist.title) }, 0) }}>Play</button>
        </article>
      ))}</div> : <div className="ht-playlists-empty"><h2>{overviewQuery ? 'No matching playlists' : 'Your next soundtrack starts here'}</h2><p>{overviewQuery ? 'Try a different search.' : 'Create a playlist, then add songs from the catalogue or Favorites.'}</p>{!overviewQuery && <button className="btn-primary" onClick={() => setShowCreate(true)}>Create Playlist</button>}</div>}
      {showCreate && <div className="ht-playlist-dialog-backdrop" role="presentation" onMouseDown={() => setShowCreate(false)}><section className="ht-playlist-dialog" role="dialog" aria-modal="true" aria-labelledby="create-playlist-title" onMouseDown={(e) => e.stopPropagation()}><p className="ht-playlists-eyebrow">NEW COLLECTION</p><h2 id="create-playlist-title">Create Playlist</h2><label>Playlist Name<input autoFocus maxLength={100} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setShowCreate(false) }} /></label><label>Description <span>(optional)</span><textarea maxLength={500} value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} /></label><div><button className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button><button className="btn-primary" disabled={!draftTitle.trim()} onClick={create}>Create Playlist</button></div></section></div>}
    </main>
  )

  const totalSeconds = active.items.reduce((sum, item) => sum + (item.duration ?? 0), 0)
  return (
    <main className="ht-playlists-destination ht-playlists-premium">
      <button type="button" className="btn-ghost btn-sm" onClick={() => { setActiveId(null); setAddOpen(false) }}>← Your Playlists</button>
      <header className="ht-playlist-detail-hero"><PlaylistArtwork playlist={active} ArtworkImage={ArtworkImage} /><div><p className="ht-playlists-eyebrow">PLAYLIST</p>{editingName ? <div className="ht-playlist-inline-edit"><input autoFocus maxLength={100} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setEditingName(false); setRenameValue(active.title) } if (e.key === 'Enter' && renameValue.trim()) { playlists.rename(active.id, renameValue); setEditingName(false) } }} /><button onClick={() => { playlists.rename(active.id, renameValue); setEditingName(false) }}>Save</button><button onClick={() => { setEditingName(false); setRenameValue(active.title) }}>Cancel</button></div> : <h1>{active.title}</h1>}{active.description && <p>{active.description}</p>}<span>{active.items.length} songs · {formatDuration(totalSeconds)} · Updated {new Date(active.updatedAt).toLocaleDateString()}</span><div className="ht-playlist-primary-actions"><button className="btn-primary" disabled={!active.items.length} title={!active.items.length ? 'Add songs before playing' : undefined} onClick={() => play(false)}>▶ Play</button><button className="btn-secondary" disabled={!active.items.length} title={!active.items.length ? 'Add songs before shuffling' : undefined} onClick={() => play(true)}>Shuffle</button><button className="btn-secondary" onClick={() => setAddOpen((v) => !v)}>+ Add Music</button><button className="btn-ghost" onClick={() => setEditingName(true)}>Rename</button><button className="btn-ghost ht-danger" onClick={() => setConfirmDelete(true)}>Delete</button></div></div></header>
      {message && <div className="ht-playlists-message" role="status">{message}</div>}
      {!active.items.length ? <section className="ht-playlists-empty"><h2>Build your playlist</h2><p>Search Hidden Tunes or choose songs you already love.</p><button className="btn-primary" onClick={() => { setAddSource('search'); setAddOpen(true) }}>Search Music</button><button className="btn-secondary" onClick={() => { setAddSource('favorites'); setAddOpen(true) }}>Add from Favorites</button></section> : <ol className="ht-playlist-track-list">{active.items.map((item, index) => <li key={playlistItemKey(item)}><span>{index + 1}</span><span className="ht-playlists-item-art"><ArtworkImage src={item.artwork ?? null} alt="" seed={item.id} label={item.title} /></span><div><strong>{item.title}</strong><span>{item.subtitle || item.type.replaceAll('_', ' ')}</span></div><span>{item.type === 'song' ? item.album : ''}</span><time>{item.duration ? formatDuration(item.duration) : '—'}</time><div><button className="btn-ghost btn-sm" onClick={() => onPlayQueue(playlistItemsToQueue(active.items, songsById), index, active.title)}>Play</button><button className="btn-ghost btn-sm" disabled={!index} aria-label={`Move ${item.title} up`} onClick={() => playlists.reorder(active.id, index, index - 1)}>↑</button><button className="btn-ghost btn-sm" disabled={index === active.items.length - 1} aria-label={`Move ${item.title} down`} onClick={() => playlists.reorder(active.id, index, index + 1)}>↓</button><button className="btn-ghost btn-sm ht-danger" onClick={() => playlists.removeItem(active.id, item.type, item.id)}>Remove</button></div></li>)}</ol>}
      {addOpen && <aside className="ht-add-music" aria-labelledby="add-music-title"><div className="ht-add-music-head"><div><p className="ht-playlists-eyebrow">DISCOVER</p><h2 id="add-music-title">Add Music</h2></div><button className="btn-ghost" aria-label="Close Add Music" onClick={() => setAddOpen(false)}>✕</button></div><div className="ht-add-music-tabs" role="tablist"><button role="tab" aria-selected={addSource === 'search'} onClick={() => { setAddSource('search'); setSelected(new Set()) }}>Search Music</button><button role="tab" aria-selected={addSource === 'favorites'} onClick={() => { setAddSource('favorites'); setSelected(new Set()) }}>Favorites</button></div><input type="search" value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder={addSource === 'search' ? 'Search songs, artists, albums…' : 'Search within Favorites'} aria-label="Search songs, artists, albums" /><div className="ht-add-music-select"><label><input type="checkbox" checked={selectable.length > 0 && selectable.every((item) => selected.has(playlistItemKey(item)))} onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map(playlistItemKey)) : new Set())} /> Select All</label><span>{selectedItems.length} selected</span><button className="btn-primary btn-sm" disabled={!selectedItems.length} onClick={addSelected}>Add Selected</button></div><ul className="ht-add-music-results">{candidates.map((item) => { const key = playlistItemKey(item); const added = existing.has(key); return <li key={key}><input type="checkbox" disabled={added} checked={selected.has(key)} aria-label={`Select ${item.title}`} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })} /><span className="ht-playlists-item-art"><ArtworkImage src={item.artwork ?? null} alt="" seed={item.id} label={item.title} /></span><div><strong>{item.title}</strong><span>{item.artist || item.subtitle} · {item.album || 'Single'}</span></div><time>{item.duration ? formatDuration(item.duration) : '—'}</time><button className="btn-secondary btn-sm" disabled={added} onClick={() => { if (!active) return; const result = playlists.addItems(active.id, [item]); setMessage(result.added ? '1 song added.' : 'Already in playlist.') }}>{added ? 'Added' : 'Add'}</button></li>})}</ul></aside>}
      {confirmDelete && <div className="ht-playlist-dialog-backdrop"><section className="ht-playlist-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-playlist-title"><h2 id="delete-playlist-title">Delete “{active.title}”?</h2><p>This removes the playlist, but does not remove songs from Favorites, Downloads, or your Library.</p><div><button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="btn-primary ht-delete-confirm" onClick={() => { playlists.remove(active.id); setConfirmDelete(false); setActiveId(null) }}>Delete Playlist</button></div></section></div>}
    </main>
  )
})

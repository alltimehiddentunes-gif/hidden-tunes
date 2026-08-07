import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPlaylistWithItems, playlistItemKey, useDesktopPlaylists } from '../../lib/playlists'
import { useLocalization } from '../../localization'
import { PlaylistPickerContext, type PlaylistPickerRequest } from './playlistPicker'

export function PlaylistPickerProvider({ children }: { children: ReactNode }) {
  const playlists = useDesktopPlaylists()
  const { t } = useLocalization()
  const [request, setRequest] = useState<PlaylistPickerRequest | null>(null)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [summary, setSummary] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const closePlaylistPicker = useCallback(() => {
    setRequest(null); setCreating(false); setQuery(''); setName(''); setDescription(''); setSummary(null)
    requestAnimationFrame(() => returnFocus.current?.focus())
  }, [])
  const openPlaylistPicker = useCallback((next: PlaylistPickerRequest) => {
    const valid = next.items.filter((item) => item.type === 'song' && item.id.trim())
    if (!valid.length) return
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setRequest({ ...next, items: valid }); setSummary(null); setCreating(false)
  }, [])
  useEffect(() => {
    if (!request) return
    const first = dialogRef.current?.querySelector<HTMLElement>('input,button:not([disabled])')
    first?.focus()
  }, [creating, request])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return playlists.playlists.filter((playlist) => !q || playlist.title.toLowerCase().includes(q))
  }, [playlists.playlists, query])
  const addExisting = (playlistId: string) => {
    if (!request) return
    const result = playlists.addItems(playlistId, request.items)
    setSummary(`${result.added} added · ${result.duplicates} already present · ${result.invalid} invalid`)
  }
  const createAndAdd = () => {
    if (!request || !name.trim()) return
    const result = createPlaylistWithItems(name.slice(0, 100), description.slice(0, 500), request.items)
    if (!result) { setSummary('0 added · 0 already present · items invalid'); return }
    setSummary(`${result.added} added · ${result.duplicates} already present · ${result.invalid} invalid`)
    setCreating(false); setName(''); setDescription('')
  }
  return <PlaylistPickerContext.Provider value={{ openPlaylistPicker, closePlaylistPicker }}>
    {children}
    {request ? <div className="ht-playlist-picker-backdrop" onMouseDown={closePlaylistPicker}>
      <div ref={dialogRef} className="ht-playlist-picker" role="dialog" aria-modal="true" aria-labelledby="playlist-picker-title" data-playlist-picker-source={request.source} onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') closePlaylistPicker() }}>
        <header><div><p>{request.items.length} song{request.items.length === 1 ? '' : 's'}</p><h2 id="playlist-picker-title">{t('music.actions.addToPlaylist')}</h2></div><button type="button" className="btn-ghost" onClick={closePlaylistPicker} aria-label={t('common.close')}>✕</button></header>
        {summary ? <div className="ht-playlist-picker-summary" role="status">{summary}</div> : null}
        {creating ? <div className="ht-playlist-picker-create"><label>{t('music.playlist.namePlaceholder')}<input autoFocus maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Description<input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></label><div><button type="button" className="btn-ghost" onClick={() => setCreating(false)}>{t('common.cancel')}</button><button type="button" className="btn-primary" disabled={!name.trim()} onClick={createAndAdd}>Create and Add</button></div></div> : <><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search playlists" aria-label="Search playlists"/><button type="button" className="ht-playlist-picker-new" onClick={() => setCreating(true)}>+ Create New Playlist</button><div className="ht-playlist-picker-list">{visible.map((playlist) => { const keys = new Set(playlist.items.map(playlistItemKey)); const duplicates = request.items.filter((item) => keys.has(playlistItemKey(item))).length; return <button type="button" key={playlist.id} onClick={() => addExisting(playlist.id)}><span><strong>{playlist.title}</strong><small>{playlist.items.length} songs</small></span><span>{duplicates === request.items.length ? 'Already added' : duplicates ? `${duplicates} already added` : 'Add'}</span></button> })}{!visible.length ? <p>{t('music.actions.noPlaylistsTitle')}</p> : null}</div></>}
      </div>
    </div> : null}
  </PlaylistPickerContext.Provider>
}

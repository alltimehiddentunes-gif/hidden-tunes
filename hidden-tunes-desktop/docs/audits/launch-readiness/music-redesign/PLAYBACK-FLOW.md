# Phase 7 — Playback flow

```text
Music card on Home
→ playFromQueue / playAlbumCollection (MusicHomePage)
→ onOpenSong prop
→ AppShell.selectAndPlay
→ DesktopPlaybackProvider.playQueue
→ HtmlAudioPlaybackService (single audio owner)
→ currentTrack / queue state
→ DesktopPersistentPlayer + PlayerBar update
→ optional PremiumFullscreenShell expand
```

## Stay-on-Home rule

When `context === 'home'` (or `'discover'`), `selectAndPlay` updates playback **without** opening `PlayerWorkspace` (`activeView: 'song'`).

Home remains visible; sidebar/footer show the active session.

## Album play

```text
Visible Play control
→ playAlbumCollection(card)
→ onOpenSong(tracks[0], tracks, 0, 'home', title, { seedType: 'album', bounded: true })
→ Queue populated with album tracks
→ Home stays mounted
```

## Album details

```text
Album card body
→ onOpenAlbum(album)
→ openAlbum → activeView 'album' → AlbumDetailView
```

Intentional navigation only — never as a side effect of Play.
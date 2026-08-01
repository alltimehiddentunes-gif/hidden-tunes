# Current Music Audit / Route Matrix / Data Contract

## Routes (MusicSubNav)

Discover · Songs · Albums · Artists · Genres · Moods · Liked · Recent · Scenes · Downloads

## Data

| Area | Real source |
|------|-------------|
| Songs/Albums/Artists | Catalog + pagination windows |
| Genres | `MUSIC_GENRES` + `genre:` intent → filtered API (uncapped loaded page) |
| Moods | `buildMoodVibeCards` emotional lanes |
| Liked/Recent | Local likes / history (honest about device-local) |
| Scenes | Editorial scene playlists (not Library playlists) |
| Downloads | Real Downloads owner (Phase 9) |

## Playback

All plays use `onOpenSong` + Queue seed pools. Expanded player synced via `usePlayerShellHooks` → DesktopPlaybackProvider.

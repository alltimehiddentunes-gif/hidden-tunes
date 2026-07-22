# User Playlists — Architecture

- Storage: `ht-desktop:playlists:v1`
- Module: `src/lib/playlists/`
- UI: `src/components/playlists/DesktopPlaylistsPage.tsx`
- Playback: `playlistItemsToQueue` → existing `onOpenSong` / playback owner
- Identity: `{type}:{id}` — never raw id alone

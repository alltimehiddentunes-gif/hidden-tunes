# Architecture Owners

| System | Owner | Protected? | Dirty dependency | Release risk |
|--------|-------|------------|------------------|--------------|
| Shell / routes | `App.tsx` NavKey state machine | De facto | Huge dirty App.tsx | High concentration |
| Left nav | `Sidebar` in App.tsx | Yes | Dirty | — |
| Top nav | `GlobalTopNav.tsx` | Yes | Dirty | — |
| Right player | `DesktopPersistentPlayer` / `TvNowPlayingPanel` via `resolveActivePlayerSurface` | Partial | **Untracked resolver** | Sports surface gap |
| Bottom bar | `PlayerBar` / transport in App.tsx | Yes | Dirty | Duplicated transport UI |
| Audio | `HtmlAudioPlaybackService` + provider | Yes | Dirty provider | — |
| Video | `HtmlVideoPlaybackService` singleton | Yes | — | Sports/Motivational mount gap |
| Mutex | Provider `stopInactiveMedia` | Yes | — | Static verify PASS |
| Queue | Provider + `lib/queue` + smartContinuation | Partial | **Untracked smartContinuation** | WIP |
| Catalog music | `api.ts` + `musicCatalog/*` | Yes | Dirty | Dual Express/admin |
| Catalog multi-family | Electron `catalogBridge.js` + preload | Yes | — | — |
| Runtime config | `desktopRuntimeConfig.ts` + `electron/runtimeConfig.js` | Yes | Both dirty | Drift risk |
| Search | DiscoverPage + `useGlobalDesktopSearch` | Yes | Dirty App | Genre intents coupled |
| Library | typed v2 + DesktopLibraryPage | Yes | — | Sports favs unsupported |
| Downloads | Electron DownloadManager + DesktopDownloadsPage | Yes | — | Music stub contradiction |
| Genres | `musicGenres.ts` | New | **Staged required** | Critical dirty |

## Duplication risks

- Transport controls across footer / persistent player / TV surface
- Runtime allowlists in main + renderer
- Downloads real route vs Music “not available” stub
- `resolveActivePlayerSurface` TV-only vs sports video path

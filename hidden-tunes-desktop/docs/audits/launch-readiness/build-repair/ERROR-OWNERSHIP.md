# Error ownership

| Type / contract | Owner file | Notes |
|-----------------|------------|-------|
| `ApiSong` | `src/lib/api.ts` | `album: string` (required) |
| `Window.hiddenTunesDesktop` | `src/lib/desktopBridgeTypes.ts` | Single ambient declaration |
| Catalog bridge helpers | `src/lib/desktopCatalogBridge.ts` | Imports shared types; no second Window declare |
| Downloads bridge helpers | `src/lib/downloads/bridge.ts` | Narrows ambient downloads API to `DownloadsBridge` |
| Runtime config | `src/lib/config/desktopRuntimeConfig.ts` | Side-effect import of bridge types |
| Global search state | `src/lib/search/useGlobalDesktopSearch.ts` | Family generics must stay explicit on idle |
| Global search UI | `src/components/search/GlobalSearchSections.tsx` | Consumes `ReturnType<typeof useGlobalDesktopSearch>` |
| Offline → queue mapping | `src/lib/downloads/dispatchDownloadPlayback.ts` | Must satisfy `ApiSong` |
| Playlist → queue mapping | `src/lib/playlists/dispatchPlaylistPlayback.ts` | Must satisfy `ApiSong` |
| Nav keys | `src/App.tsx` (`NavKey`, `isNavKey`) | Shell-owned |
| Playback ownership | `DesktopPlaybackProvider` | **Untouched** in this phase |
| Video surface routing | `resolveActivePlayerSurface.ts` | **Untouched** (Sports surface still TV-only) |

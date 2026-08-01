# Fix log

| Pass | Errors before | Errors after | Root cause fixed | Files |
|------|--------------:|-------------:|------------------|-------|
| Prior audit HEAD | 72 | 72 | (baseline) | — |
| Working-tree cluster repairs (pre-existing at phase start + completed this phase) | 72 | 0 | A–E clusters | See below |
| NavKey guard polish | 0 | 0 | Replace `as NavKey` with `isNavKey` | `App.tsx` |
| Downloads bridge import | 0 | 0 | Ensure ambient module loaded from downloads path | `bridge.ts` |

## Repairs made

### Group A — Single Window bridge ambient
- Added `src/lib/desktopBridgeTypes.ts`
- Removed conflicting `declare global` from `desktopCatalogBridge.ts`, `downloads/bridge.ts`, `desktopRuntimeConfig.ts`
- Safer optional chaining when calling catalog `getJson` / `requestJson`

### Group B — Search idle typing
- `useGlobalDesktopSearch.ts`: typed `emptyFamily<RadioStationMeta>()` (etc.) instead of shared untyped idle

### Group C — ApiSong.album nullability
- `dispatchDownloadPlayback.ts`: `metaString(...) ?? ''`
- `dispatchPlaylistPlayback.ts`: `item.album ?? ''`

### Group D — Unused locals
- Removed unused `MusicNoteIcon`
- Exported retained `PlaylistsPage` / `RecentPage` (still present for reference; Library uses desktop pages)
- Voided unused `playlistsQuery` / `setPlaylistsQuery` props in `PageContent`

### Group E — NavKey callback
- `isNavKey` type guard + guarded call into `onNavigateNav`

## Intentionally not changed
- Playback provider / mutex / queue ownership
- Sports video surface mount behaviour
- Home Recently Added fake content
- CSP / signing / version
- Backend / mobile
- No commit

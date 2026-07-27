# AFTER

## Result

Desktop Home hierarchy reorganised, duplicate top route strip removed, left sidebar sectioned, and a real persistent Now Playing rail wired to `DesktopPlaybackProvider`.

## Files changed (Home/player)

- `src/components/player/DesktopPersistentPlayer.tsx` *(new)*
- `src/components/music/GlobalTopNav.tsx`
- `src/components/home/MusicHomePage.tsx`
- `src/App.tsx` *(surgical: sidebar groups, AppShell rail wiring — catalog dirty work excluded from commit)*
- `src/App.css` *(persistent player / compact header / responsive)*
- `scripts/smoke-home-player-layout.mjs` *(new)*
- `docs/audits/home-player-layout/*`

## Preserved dirty catalog work

Still uncommitted after this commit (Category A):

- electron catalog/config bridge files
- `MusicWorkspace.tsx`, `api.ts`, `catalogCache.ts`, `desktopCatalogBridge.ts`
- `src/lib/config/`, `src/lib/musicCatalog/`
- verify-catalog / verify-production scripts
- Working-tree App.tsx restored to include catalog pagination after commit

## Verdict path

Desktop Home and persistent player complete

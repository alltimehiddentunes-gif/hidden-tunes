# Runtime Dependency Map

## Required modules (must be in HEAD)

| System | Paths |
|--------|-------|
| Genres | `src/lib/musicGenres.ts`; Home/Music/App consumers |
| Smart continuation | `src/lib/desktopPlayback/smartContinuation.ts`; `queueIntelligence.ts`; `DesktopPlaybackProvider.tsx` |
| Surface resolver | `src/lib/player/resolveActivePlayerSurface.ts`; `App.tsx` |
| TV transport | `src/lib/tv/tvChannelTransport.ts`; provider + `TvNowPlayingPanel` |
| Display text | `src/lib/catalogDisplayText.ts`; api/home/music |
| Global background | `src/components/HiddenTunesGlobalBackground.tsx` |
| Home assets | `public/home-reference/*` (referenced by `MusicHomePage.tsx`) |
| Shell/playback/UI dirty set | `App.tsx`, `App.css`, `index.css`, Home/Music/TV/player components, musicCatalog, runtime configs |
| Tooling | `package.json`, `electron/runtimeConfig.js` |

## Explicitly NOT runtime-critical

- `scripts/_*` one-shot patch/probe helpers
- `docs/audits/player-sidebar/_bak*` source backups
- Audit PNGs/JSON (documentation only)

## Sports

Fixture browse remains; watch surface remains **unsafe** — no behaviour change in this phase.

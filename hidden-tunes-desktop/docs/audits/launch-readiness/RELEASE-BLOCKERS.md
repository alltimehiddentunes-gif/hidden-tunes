# Release blockers (HEAD `3b4a91f`)

Only **CRITICAL** and **HIGH** block public launch.

## CRITICAL

1. **Production build script fails** — `npm run build` → `tsc -b` exits with **72 errors**. Official `npm run dist` cannot complete. Root `tsc --noEmit` is a noop false green (`tsconfig.json` `"files": []`).
2. **Sports (and motivational video) watch surface** — `usesDesktopVideoPath` includes sports/video families, but `resolveActivePlayerSurface` returns `'tv'` only for `isTvQueueSong`. Rail mounts `TvNowPlayingPanel`/`TvVideoSurface` only for TV. Sports can resolve/play with **no visible video** (audio-only / parked element). Unsafe to market as watchable.
3. **Home “Recently Added” honesty** — Hardcoded `HOME_RELEASES` titles/artists/artwork while clicks play real catalog songs (`MusicHomePage.tsx`).

## HIGH

4. **No Electron CSP** — `index.html` has no Content-Security-Policy; main process does not set one.
5. **No navigation / window-open URL guards** — `will-navigate` / `setWindowOpenHandler` absent in `electron/main.js`.
6. **Packaging not release-grade** — `version: 0.0.1`, `signAndEditExecutable: false`, Windows NSIS only; no clean-machine signed installer proof.
7. **Premium product honesty** — Offline Listening and Cinematic Player Modes listed `coming-soon` while Downloads and cinematic player shells are live.
8. **Sports DASH** — Resolver can return `protocol: 'dash'`; `HtmlVideoPlaybackService` only handles HLS + direct URL.
9. **ESLint gate** — 33 errors; not clean for a release quality bar.
10. **Music visual redesign still required** — Functional but not at Home premium parity (letter genre tiles, thin Discover chrome).
11. **Genre UI pagination cap** — Load more can fetch songs the Songs panel never shows (cap 24).
12. **Library sports favourites** — Schema allows sports; dispatch says unsupported.

## MEDIUM (should fix; not sole launch stoppers if CRITICAL/HIGH cleared)

- No `requestSingleInstanceLock`
- Home Charts/Moods use free-text search not genre pipeline
- Radio no load-more
- Lectures missing from global search
- Home sidebar label remaps (Music Videos→TV, etc.)
- Settings disabled Appearance/Playback tabs + cosmetic slider
- Artist profile direct `fetch` bypasses catalog bridge
- Focus/`outline: none` inconsistency
- Live genre inventory unverified (API 503 at audit)

## LOW

- Dual player chrome (rail + bottom bar)
- Bundle >500 kB single chunk
- Icons undeclared in electron-builder config (files exist under `build/`)
- Hardcoded UI version string
- Mature radio filtered with no access UI

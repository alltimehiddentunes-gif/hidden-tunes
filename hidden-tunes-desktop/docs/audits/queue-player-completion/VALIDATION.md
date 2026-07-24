# Validation

## Commands

From `hidden-tunes-desktop`:

```powershell
npx tsc --noEmit
npx eslint src/lib/queue src/context/DesktopPlaybackProvider.tsx src/components/player/PlayerShellPanels.tsx src/components/library/DesktopLibraryPage.tsx src/lib/desktopPlayback/types.ts --quiet
node scripts/verify-playback-mutex.mjs
node scripts/verify-queue-contract.mjs
$env:HT_VALIDATE_URL='http://localhost:5175'; npx electron scripts/validate-queue-runtime.mjs
node scripts/verify-sports-contract.mjs
node scripts/verify-history-contract.mjs
node scripts/verify-global-search-contract.mjs
node scripts/verify-playlists-contract.mjs
node scripts/verify-typed-library-contract.mjs
node scripts/verify-downloads-contract.mjs
```

## Results (Phase 6)

| Check | Result |
| ----- | ------ |
| TypeScript (`npx tsc --noEmit`) | Pass |
| ESLint (queue / provider / panels / library enqueue) | Pass |
| Playback mutex | Pass |
| Queue contracts | **56 passed**, 0 failed |
| Electron queue runtime | **45 passed**, 0 failed |
| Sports contract regression | 51 passed |
| History contract regression | 21 passed |
| Global search contract regression | 24 passed |
| Playlists contract regression | 36 passed |
| Typed Library contract regression | 62 passed |
| Downloads contract regression | 62 passed |
| 1024px layout (runtime) | Pass (`width=1024`) |

## Runtime harness

`scripts/validate-queue-runtime.mjs` (≥ 30 checks; observed **45**):

- UI ready / destination smoke (Home, Music, Radio, Sports, TV, Podcasts, Library, Downloads, Playlists, History)
- Paused queue restore (no autoplay) for `ht-desktop:queue:v1`
- Music catalog play + Up Next panel (clear / remove / reorder)
- Queue remove interaction (row count decreases after React update)
- Radio station play + LIVE progress labels (when stations load via `ht-catalog-request`)
- Soft ownership Music → Sports → Radio (≤ 2 bars, ≤ 1 video)
- Malformed persistence survival
- Contract soft mirrors (seek / previous / mature skip / TV-Sports exclusion)

Evidence: `docs/audits/queue-player-completion/runtime-results.json`

## Notes

- Runtime Electron session stubs download IPC; full Downloads security remains covered by `verify-downloads-contract.mjs`.
- Audio overlap prevention relies on existing playback mutex + ownership diagnostics (not DOM-only).

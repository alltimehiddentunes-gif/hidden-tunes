# Validation

## Commands

From `hidden-tunes-desktop`:

```powershell
npx tsc --noEmit
npx eslint src/lib/queue src/context/DesktopPlaybackProvider.tsx src/components/player/PlayerShellPanels.tsx src/components/library/DesktopLibraryPage.tsx src/lib/desktopPlayback/types.ts --quiet
node scripts/verify-playback-mutex.mjs
node scripts/verify-queue-contract.mjs
npm run dev:vite -- --port 5175 --strictPort
$env:HT_VALIDATE_URL='http://localhost:5175'; npx electron scripts/validate-queue-runtime.mjs
```

## Results (Phase 6 recovery repair)

| Check | Result |
| ----- | ------ |
| TypeScript (`npx tsc --noEmit`) | Pass |
| ESLint (queue / provider / panels / library / types) | Pass |
| Playback mutex | Pass |
| Queue contracts | **85 passed**, 0 failed |
| Electron queue runtime | **45 passed**, 0 failed |
| 1024px layout (runtime) | Pass (`width=1024`) |

## Runtime harness evidence

`scripts/validate-queue-runtime.mjs` (observed **45**):

- UI ready; destination smoke (Home, Music, Radio, Sports, TV, Podcasts, Library, Downloads, Playlists, History)
- Paused queue restore (no autoplay) for `ht-desktop:queue:v1`
- Music catalog play + Up Next panel (clear / remove / reorder)
- Queue remove interaction
- Radio station play + LIVE progress labels
- Soft ownership Music → Sports → Radio (≤ 2 bars, ≤ 1 video, 1 audio)
- Malformed persistence survival
- Contract soft mirrors (seek / previous / mature skip / TV-Sports exclusion)

Evidence: `docs/audits/queue-player-completion/runtime-results.json`

## Notes

- Targeted ESLint intentionally excludes full `App.tsx` (pre-existing unrelated lint debt outside Phase 6 repair scope). Phase 6 App.tsx live-progress changes remain covered by runtime LIVE assertions.
- Audio overlap prevention relies on existing playback mutex + ownership diagnostics.
- Sports production playable fixture may be unavailable; ownership handoff still validated softly without inventing fixtures.

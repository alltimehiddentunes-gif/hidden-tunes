# Sports Foundation — Validation

## Commands

```powershell
cd C:\Users\Wills\Desktop\HiddenTunes-desktop-integration\hidden-tunes-desktop
npx tsc --noEmit
npx eslint electron/catalogBridge.js electron/main.js electron/preload.js src/lib/sports src/components/sports src/lib/desktopCatalogBridge.ts src/lib/search/useGlobalDesktopSearch.ts src/components/search/GlobalSearchSections.tsx src/lib/history src/lib/music/navTypes.ts src/lib/player/mediaAdapter.ts src/components/history/DesktopHistoryPage.tsx --quiet
node scripts/verify-playback-mutex.mjs
node scripts/verify-sports-contract.mjs
node scripts/verify-history-contract.mjs
# With Vite on :5174 (or :5173):
$env:HT_VALIDATE_URL='http://localhost:5174'
npx electron scripts/validate-sports-runtime.mjs
```

## Results (this phase)

| Check | Result |
| ----- | ------ |
| TypeScript | Pass (`tsc --noEmit`) |
| ESLint (Sports-touched production files) | Pass |
| Playback mutex | Pass (includes Sports video path) |
| Sports contract | Pass (**51** checks) |
| History contract | Pass (**21** checks) |
| Electron Sports runtime | Pass (**27** checks) — see `runtime-results.json` |
| Downloads / Playlists / Library / Global Search contracts | Pass (smoke) |
| Global Search runtime smoke | Pass (**11** checks) |
| Production playback | **unavailable during test** |
| 1024px layout | Pass |

## Pass criteria when public is disabled

Shell renders (`.sports-destination`), filter tabs work, empty/unavailable copy is truthful, no fake fixtures / fake LIVE / fake 0–0, no duplicate player/video surfaces. **Production playback may remain unavailable during test.**

## Probe notes (locked)

- Host `https://admin.hiddentunes.com`
- Public `enabled:false` empty
- Pilot: finished basketball; titles may say LIVE; `status.code=finished`
- Play resolver authoritative (409 finished)
- watch-options pilot ignore — known defect
- Search works under pilot; no live/upcoming in probe window
- Page size 24; refresh 45s; search via `/api/sports/search` bounded
- Library/Downloads deferred / `stream_only`
- Optional pilot: main-process `HT_SPORTS_PRIVATE_PILOT_TOKEN` / `VITE_SPORTS_PRIVATE_PILOT_TOKEN` (never committed)

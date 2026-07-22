# User Playlists — Validation

## Commands

```powershell
npx tsc --noEmit
npx eslint src/lib/playlists src/components/playlists --quiet
node scripts/verify-playback-mutex.mjs
node scripts/verify-playlists-contract.mjs
$env:HT_VALIDATE_URL='http://localhost:5174'
npx electron scripts/validate-playlists-runtime.mjs
```

## Results

| Check | Result |
| ----- | ------ |
| TypeScript | Pass |
| ESLint | Pass |
| Playback mutex | Pass |
| Contract | Pass (36) |
| Electron runtime | Pass (19) — see `runtime-results.json` |
| 1024px layout | Pass |
| Library independence on delete | Pass |

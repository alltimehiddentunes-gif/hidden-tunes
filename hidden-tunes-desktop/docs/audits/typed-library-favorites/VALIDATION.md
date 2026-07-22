# Validation

## Commands

```powershell
cd C:\Users\Wills\Desktop\HiddenTunes-desktop-integration\hidden-tunes-desktop
npx tsc --noEmit
npx eslint src/lib/library src/components/library src/components/radio/RadioPage.tsx src/lib/home/musicLikesStorage.ts src/lib/home/isMusicCatalogSong.ts --quiet
node scripts/verify-playback-mutex.mjs
node scripts/verify-typed-library-contract.mjs
# With Vite on :5173:
npx electron scripts/validate-typed-library-runtime.mjs
```

## Results

| Check | Result |
| ----- | ------ |
| TypeScript | Pass (`tsc --noEmit`) |
| ESLint (changed Library/radio/likes files) | Pass |
| Playback mutex | Pass |
| Contract harness | Pass (62 checks) |
| Electron runtime | Pass (20 checks) — see `runtime-results.json` |
| 1024px layout | Pass (`width=1024`) |

## Contract coverage highlights

- Typed identity non-collision
- Add/remove family isolation
- Duplicate suppression
- Song / Radio / TV / Lecture migration
- Radio never becomes YouTube/song
- Malformed rejection
- Idempotent second migration
- Mature gating for Sex Sound Radio
- Playback dispatch per family
- Unsupported types fail visibly

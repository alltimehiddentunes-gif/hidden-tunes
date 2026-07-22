# Downloads / Offline — Validation

## Commands

```powershell
cd C:\Users\Wills\Desktop\HiddenTunes-desktop-integration\hidden-tunes-desktop
npx tsc --noEmit
npx eslint electron/downloads electron/main.js electron/preload.js src/lib/downloads src/components/downloads src/components/podcasts/PodcastShowPage.tsx src/components/audiobooks/AudiobookBookPage.tsx src/components/motivationals/MotivationalProgramPage.tsx src/lib/desktopPlayback/isPlayableMediaUrl.ts src/lib/audioVersions.ts --quiet
node scripts/verify-playback-mutex.mjs
node scripts/verify-downloads-contract.mjs
# With Vite on :5173:
npx electron scripts/validate-downloads-runtime.mjs
```

## Results

| Check | Result |
| ----- | ------ |
| TypeScript | Pass (`tsc --noEmit`) |
| ESLint (changed download/production files) | Pass |
| Playback mutex | Pass |
| Contract harness | Pass (**62** checks) |
| Electron runtime | Pass (**29** checks) — see `runtime-results.json` |
| Offline network-disabled local play | Pass (remote HTTPS blocked; `ht-download://` podcast WAV played) |
| 1024px layout | Pass (`width=1024`) |

## Contract coverage highlights

- Identity non-collision across families / Library
- Path traversal / absolute / UNC rejection
- Protocol + host allowlist
- Radio / TV / podcast show / sports rejected
- HLS rejected
- Lifecycle queue → complete, cancel, duplicate prevention
- Restart reconciliation, missing → `missing`
- Remove file + metadata; favorite store conceptually separate
- Renderer list has no absolute paths

## Runtime coverage highlights

- Downloads page + empty state + bridge
- Podcast + music finite download completion
- Progress / completion UI
- Failed HLS + cancel + retry
- Offline play with remote blocked
- Remove preserves Library favorite
- Radio / TV have no Download control
- Mature gating
- Single player bar; TV page unaffected

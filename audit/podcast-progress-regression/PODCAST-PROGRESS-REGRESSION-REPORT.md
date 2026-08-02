# Podcast Progress Regression Report

## Workspace proof

- Workspace: `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142`
- Branch: `fix/library-content-type-safe`
- Metro: port 8081, `packager-status:running`

## Cause and last working state

Commit `9d17c87d` raised the shared foreground progress publication gate from 1,000 ms to 1,500 ms. Native Podcast playback events arrive at approximately 1,000 ms, and the later performance guard requires both time and position-delta gates. Normal events therefore missed the 1,500 ms gate and Podcast React state published on later ticks, producing freezes and jumps.

The last known-good shared progress state for Podcast is the `23e78bc9` state, where foreground progress publication was 1,000 ms. Recent Podcast performance (`f6176ce2`), continuation, and lock-screen metadata changes did not replace the progress subscription or introduce a Podcast timer.

## Trace

Native `HiddenAudioProgressChanged` (~1 Hz)
→ `subscribeHiddenAudioProgress`
→ `PlayerContext.applyHiddenAudioProgressToUi`
→ Podcast identity from queue context/current item
→ sliced `PlayerProgressContext`
→ `MiniPlayerProgress`
→ full Player `PlayerProgressPanel`

Lock-screen elapsed remains native-owned and updates at whole-second resolution.

## Minimal repair

- `context/PlayerContext.tsx`: added a Podcast-domain predicate and restored only foreground Podcast publication/fallback cadence to 1,000 ms.
- Podcast Next/Previous now resolve metadata-only queue targets before changing the active index or calling `loadAndPlay`, and replace only the resolved row in the existing queue. A failed resolve leaves the playing episode and queue index unchanged.
- Music remains at 1,500 ms.
- Radio remains at 8 seconds foreground / 15 seconds background.
- Background shared-audio publication remains 5 seconds.
- `scripts/test-podcast-progress-regression.mjs`: added focused cadence and consumer contracts.
- This report.

No timer, listener, queue, player, playback owner, or metadata owner was added.

## Results

- Native frequency: iOS ~1 Hz; Android ~1 Hz; unchanged.
- PlayerContext Podcast foreground frequency: target ~1 Hz after repair.
- MiniPlayer source path: PASS; device verification pending.
- Full Player source path: PASS; device verification pending.
- Pause/resume/seek: existing path unchanged; static progress/seek guards PASS; device result pending.
- Next/Previous target resolution and index-preservation contract: PASS; device result pending.
- Auto-next reset: domain queue, same-show auto-next, continuation, and bounded queue tests PASS; device result pending.
- Lock-screen position: Podcast metadata and native iOS progress ownership tests PASS; device result pending.
- TypeScript (`tsc --noEmit`): PASS.
- Focused Podcast progress test: PASS.
- New focused test ESLint: PASS.
- Podcast episode pipeline, Mature gate/isolation, ultra-performance, continuation, same-show autoplay, and queue-bound tests: PASS.
- Android and iOS native progress/performance guards: PASS.
- Media-switch/playback handoff test: PASS.
- Full-file targeted ESLint remains blocked by the previously recorded existing playback UI React Compiler/hook findings; this repair adds no new reported lint finding.
- Device/10-minute verification: NOT RUN in this environment; required before commit.

## Performance, OTA, and build

The change restores one-second React progress publication only while a foreground Podcast is active. Native traffic and whole-app state structure are unchanged. This is a JavaScript/TypeScript-only change and is OTA-compatible; no new native build is required for the repair itself.

Music, Radio, TV, CarPlay, Android Auto, navigation, UI design, ownership, Queue semantics, continuation rules, Mature isolation, auto-next behavior, and lock-screen metadata mapping were not changed by this repair.

# CPU Idle Audit Report

**Date:** 2026-06-27  
**Incident:** iOS IPS `cpu usage` — process killed (~98% average CPU for ~49s)  
**Scope:** Full React Native app audit — idle Home, paused, not scrolling, not searching

---

## Method

1. Static audit of all `setInterval`, `requestAnimationFrame`, `Animated.loop`, `withRepeat`, context providers, playback listeners, and tab mount behavior.
2. Native HiddenAudio iOS source review (`addPeriodicTimeObserver` interval, pause teardown).
3. DEV instrumentation added via `utils/cpuIdleProfiling.ts` (`ENABLE_CPU_IDLE_PROFILING = true` in dev only).
4. Surgical fixes applied only where continuous work was proven — no feature changes.

---

## Continuous CPU Sources Found

### HIGH — Home hero glow `Animated.loop`

| | |
|---|---|
| **Location** | `app/(tabs)/index.tsx` — `useFocusEffect` |
| **Why it consumed CPU** | Ran continuously whenever Home was focused, including idle/paused browsing. Native-driver animation still keeps the compositor and RN Animated bridge active. |
| **Fix** | Glow starts only when `shouldRunNonEssentialWork()` is true. Stops on fast scroll, app background/inactive, and on blur cleanup. Static opacity when paused. |

### HIGH — Home hero auto-slide `setInterval`

| | |
|---|---|
| **Location** | `app/(tabs)/index.tsx` — 7s carousel when `!isPlaying` |
| **Why it consumed CPU** | Periodic `setHeroIndex` + `scrollToOffset` re-renders and scroll work while user was idle on Home with multiple hero cards. |
| **Fix** | Interval only runs when `shouldRunNonEssentialWork()` and app is active. Cleared during scroll and background. |

### HIGH — `NeonEQ` JS-thread animation (`useNativeDriver: false`)

| | |
|---|---|
| **Location** | `components/NeonEQ.tsx` — Home hero "Now Playing" pill |
| **Why it consumed CPU** | Height interpolation on the JS thread every frame while music played during Home browse. Four `Animated.loop` instances with `useNativeDriver: false`. |
| **Fix** | Migrated to `scaleY` + `translateY` with `useNativeDriver: true`. Animation disabled when `!shouldRunNonEssentialWork()` (scroll/background). Static bars when not animating. |

### HIGH — `LiveWaveform` Reanimated loop while playing on Home

| | |
|---|---|
| **Location** | `components/LiveWaveform.tsx` — Home hero overlay when `currentSong` set |
| **Why it consumed CPU** | `withRepeat` UI-thread animation ran whenever `isPlaying`, including during list scroll on Home. |
| **Fix** | Added `shouldRunNonEssentialWork()` gate alongside existing `AppState` gate. |

### MEDIUM — HiddenAudio JS polling while paused

| | |
|---|---|
| **Location** | `context/PlayerContext.tsx` — `startHiddenAudioPolling` |
| **Why it consumed CPU** | `setInterval` (2.5s) continued after pause, calling `HiddenAudio.getStatus()` + `applyHiddenAudioStatus()` and arming finish watchdogs. Native progress observer correctly stops on pause; JS poll did not. |
| **Fix** | Polling starts only when `isPlayingRef.current`. Poll body returns early when paused. `stopHiddenAudioPolling()` on pause in `togglePlayPause`. Restart via `applyProgressUpdateInterval` on resume. |

### MEDIUM — Duplicate native progress subscription

| | |
|---|---|
| **Location** | `context/PlayerContext.tsx` — `subscribeHiddenAudioProgress(() => {})` |
| **Why it consumed CPU** | No-op handler still received every native `HiddenAudioProgress` event (duplicate of `HiddenAudioProgressChanged`), doubling bridge traffic while playing. |
| **Fix** | Removed noop subscription. |

### MEDIUM — Position React updates while paused

| | |
|---|---|
| **Location** | `context/PlayerContext.tsx` — `applyHiddenAudioStatus` |
| **Why it consumed CPU** | Position state could still update on poll ticks while paused, propagating to `PlayerProgressContext` → MiniPlayer progress subtree. |
| **Fix** | Position state updates only when playing (or large seek delta >1800ms while paused). |

### LOW — MiniPlayer YouTube AsyncStorage poll

| | |
|---|---|
| **Location** | `components/MiniPlayer.tsx` — 9s interval when no `currentSong` |
| **Why it consumed CPU** | Periodic AsyncStorage read + JSON parse in background/minimized states. |
| **Fix** | Poll only when `AppState === "active"`. |

### LOW — `usePlaybackRenderProbe` effect on every render

| | |
|---|---|
| **Location** | `context/playerContextSlices.ts` |
| **Why it consumed CPU** | `useEffect` without deps scheduled after every subscriber render (Home, Search, MiniPlayer, etc.). |
| **Fix** | Direct gated call during render when heavy perf diagnostics enabled — no per-render effect scheduling. |

---

## Verified NOT Active in Production / Idle

| Source | Status |
|--------|--------|
| `runtimeInstrumentation` rAF stall monitor | `ENABLE_RUNTIME_INSTRUMENTATION = false` |
| `performanceVerification` long-task monitor | `ENABLE_HEAVY_PERF_DIAGNOSTICS = false` |
| `PerformanceOverlay` | Returns null when verification disabled |
| `sessionPerfDiagnostics` memory monitor | Not auto-started from app root |
| Search instant/fuzzy pipeline | Only on Search screen; tab `lazy: true`, `href: null` — not mounted on Home |
| TV polling / verification | Tab lazy; verification gated to TV focus |
| Native HiddenAudio progress observer | Stopped on `pause()` / `stop()` in Swift module |
| `getSharedDiscoverySnapshot` | In-memory cache keyed by catalog + listener fingerprint — not a loop |

---

## DEV Instrumentation Added

| File | Purpose |
|------|---------|
| `utils/cpuIdleProfiling.ts` | 30s render/timer/listener summaries, `useCpuRenderProbe`, `useCpuContextProbe` |
| `utils/devDiagnostics.ts` | `ENABLE_CPU_IDLE_PROFILING` flag (dev only) |
| `app/_layout.tsx` | Starts profiling on root mount |
| Home, Search, Player, TV, MiniPlayer | Render probes |
| `PlayerContext` | Context update probes for state/progress |

**Disable after validation:** set `ENABLE_CPU_IDLE_PROFILING = false` in `devDiagnostics.ts`.

---

## Expected Idle Behavior After Fix

On Home, paused, not scrolling:

- No hero glow loop
- No hero auto-slide interval
- No NeonEQ / LiveWaveform animation
- No HiddenAudio JS poll
- No duplicate progress events
- MiniPlayer progress bar static (no position ticks)
- YouTube mini poll suspended if app backgrounded

---

## Validation

```bash
cd hidden-tunes-app
npm run typecheck
```

**Device test:** Dev client on iPhone → Home → pause playback → idle 60s → watch Metro `[HiddenTunes:cpu-idle] summary` logs (renders should be near zero; active timers minimal).

**Production:** `ENABLE_CPU_IDLE_PROFILING` is `__DEV__`-gated — zero profiling overhead in TestFlight/App Store builds.

---

## Files Changed (CPU commit)

- `utils/cpuIdleProfiling.ts` (new)
- `utils/devDiagnostics.ts`
- `app/_layout.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/search.tsx`
- `app/(tabs)/player.tsx`
- `app/(tabs)/tv.tsx`
- `components/NeonEQ.tsx`
- `components/LiveWaveform.tsx`
- `components/MiniPlayer.tsx`
- `context/PlayerContext.tsx`
- `context/playerContextSlices.ts`
- `docs/cpu-idle-audit-report.md` (new)

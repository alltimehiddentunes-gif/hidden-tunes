# Heat + Diagnostics Logging Audit

**Scope:** Mobile app production paths only. No playback, queue, lock-screen, or auto-next behavior changes.

**Goal:** Reduce JS churn, AsyncStorage writes, and native bridge traffic from diagnostics without losing critical failure signals.

---

## Findings

### Already gated (no change needed)

| Area | Mechanism |
|------|-----------|
| `utils/playbackDiagnostics.ts` | `isVerbosePlaybackDiagnosticsEnabled()` |
| `utils/backgroundPlaybackLogs.ts` | Same verbose flag |
| `logHTAutoNext` / `logHTLockAutoNext` | `__DEV__` + `isHeavyPerfDiagnosticsEnabled()` |
| `services/trackPlayerRemoteHandlers.ts` | `__DEV__` only |
| `services/trackPlayerBackgroundDiagnostics.ts` | `__DEV__` only |
| `services/playbackBridge.ts` tap/startup logs | `__DEV__` only |
| `utils/runtimeInstrumentation.ts` | `ENABLE_RUNTIME_INSTRUMENTATION = false` |
| `utils/performanceLogs.ts` | `ENABLE_BASIC_PERF_DIAGNOSTICS = false` |
| Home/explore stage logs | `__DEV__` only |
| Search result tap logs | `__DEV__` only |

### Production churn identified

| Source | Issue | Risk |
|--------|-------|------|
| `context/PlayerContext.tsx` | ~40 ungated `console.log` (startup, errors, YouTube guards) | Console I/O on hot/cold paths |
| `context/PlayerContext.tsx` | `savePlaybackPosition` → AsyncStorage every ~12s during playback | Disk writes + JS stringify |
| `context/PlayerContext.tsx` | `persistActiveQueue` → `multiSet` on every queue index change | Burst writes on skip/auto-next |
| `components/RemoteMediaControlsBridge.tsx` | `syncRemoteMediaSession` on every `positionMillis` React update (~2s) | Native metadata/state bridge calls |
| `services/remoteMediaControls.ts` | Ungated `console.log` in module-load/sync catch paths | Rare but always-on in dev builds |
| `app/onboarding.tsx` | `continue pressed` log in production | One-shot, unnecessary |

### Intentionally unchanged (playback-critical)

| Source | Why left alone |
|--------|----------------|
| HiddenAudio `setInterval` poll | Required for finish detection + lock-screen auto-next |
| RNTP progress interval (1s active / 2s bg) | Native finish/progress pipeline; changing risks auto-next |
| `RemoteMediaControlsBridge` handler wiring | Lock-screen command path |
| `logPlaybackCritical` | Defined but unused; no runtime cost |

---

## Fixes applied

1. **`utils/playerContextLogs.ts`** — `logPlayerContextDev` (dev-only) and `logPlayerContextError` (always `console.warn`).
2. **`PlayerContext.tsx`** — Route all former `console.log` calls through the helpers; gate startup/YouTube guard traces to dev.
3. **`PlayerContext.tsx`** — Debounce position persist (900ms) with immediate flush on app background/inactive; widen save interval (15s / 8s delta).
4. **`PlayerContext.tsx`** — Debounce active-queue persist (600ms) to coalesce rapid index changes.
5. **`RemoteMediaControlsBridge.tsx`** — Throttle position-only sync to 5s; immediate sync on song/play/loading changes.
6. **`remoteMediaControls.ts`** — Route catch-path logs through existing dev-gated `logRemoteMedia`.
7. **`app/onboarding.tsx`** — Gate continue log behind `__DEV__`.

---

## Validation

```bash
npm run lint
npm run typecheck
npx expo config --type introspect --json
```

Manual: tap-to-play, background playback, lock-screen controls, auto-next, debug diagnostics when flags enabled.

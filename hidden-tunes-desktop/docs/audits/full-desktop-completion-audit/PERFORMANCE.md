# Performance Audit

## Observed / code-visible risks

| Risk | Evidence | Severity |
|------|----------|----------|
| Monolithic `App.tsx` + huge `App.css` | Parse/layout cost; mega styles | High |
| Premium audio visualizer RAF | Continuous RAF; UI emit throttle 200ms | Medium |
| Dual catalog caches | Legacy localStorage + page cache | Medium |
| Sports 45s live refresh | Visibility-gated poll | Low–Medium |
| Global search fan-out | Parallel family fetches | Medium |
| Download IPC broadcast to all windows | Multi-instance amplifies (no single-instance lock) | Medium |
| Sync `ht-runtime-info` IPC | Brief renderer block | Low |
| Atmosphere timers | 60s; reduced-motion aware | Low |

## Runtime notes (this audit)

- App launched successfully from SSD with Vite ready in ~1s.
- Electron smoke catalog runtime completed (~150s) PASS under Electron runner.
- No formal CPU/memory instrumentation captured in this audit (no profiler session).
- Do **not** treat static contract PASS as proof of good runtime performance.

## Remaining measurable work

1. Baseline first-launch and route-transition timings on clean machine
2. Memory growth over 30–60 min mixed playback
3. Music/Radio/TV catalogue scroll + artwork decode under load
4. Search latency with all families online
5. Confirm visualizer off-path when not displayed
6. Remove or gate verbose diagnostics in production builds

## Verdict

No catastrophic timer storm found in source review, but performance is **unproven for release** and monolith size remains a structural risk.

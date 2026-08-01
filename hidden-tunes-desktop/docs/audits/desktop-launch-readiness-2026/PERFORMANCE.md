# Performance Audit

**Method:** Build metrics + source patterns. No live profiler session this pass (Electron not instrumented for FPS/CPU in this audit).

---

## Measured / observed

| Metric | Evidence | Assessment |
|--------|----------|------------|
| Production build | `tsc -b && vite build` exit 0 in ~2.2s transform | PASS |
| JS bundle | `dist/assets/index-*.js` **1,391 KB** (gzip **386 KB**) | MAJOR — single chunk |
| CSS bundle | **497 KB** (gzip **80 KB**) | MAJOR — large |
| Modules transformed | 289 | Moderate app surface |
| Chunk warning | Vite warns &gt;500 KB; no code-splitting configured | Gap |
| Dist total | ~7.5 MB / 40 files | OK for desktop |
| Installer | ~107.5 MB NSIS | Typical Electron |
| Catalog bootstrap | First pages only — never full catalogue download (`api.ts`) | PASS |
| List mounting | `useCatalogWindow` slices (24+24), not virtualization | PARTIAL |
| Genre load | Up to 25 remote pages scanned | Risk under slow network |
| App monolith | 8335-line App.tsx | Compile/HMR/maintain cost |
| Artwork | Bundled hero PNGs 65–162 KB; remote artwork unbounded by client | Watch oversized remote art |
| Startup | Not stopwatch-measured this pass | Needs CDP timing after freeze |
| First render | Not measured | Needs CDP |
| Navigation | State swap (no router) — generally cheap | Likely OK |
| Search | Hook-based; depends on catalog/API | Needs timing |
| Scrolling | No virtual list lib found | Large lists may jank |
| Playback responsiveness | Mutex + single owner — architecture favors snappy switches | Script-verified semantics |
| Background | Window-open process; quit on Windows when closed | No tray measured |
| Memory / CPU / GPU | Not profiled | Deferred to Phase performance |

---

## Hotspots / smells

1. **No route-level code splitting** — entire UI in one JS chunk  
2. **Huge App.css** — likely unused/legacy rules accumulated  
3. **Windowing ≠ virtualization** — thousands of DOM nodes still possible if user expands aggressively  
4. **Genre scan loops** — sequential remote pages  
5. **Duplicate nav chrome** — extra React trees for overlapping nav  
6. **Dirty WIP scripts** (`scripts/_*.mjs`) — noise only; not in production bundle if unused

---

## Performance score: **66 / 100**

Shipable for early desktop if catalogs stay bounded, but not “true production-ready” until chunking + list virtualization + startup measurement land.

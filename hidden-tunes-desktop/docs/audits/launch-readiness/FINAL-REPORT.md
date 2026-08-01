# Hidden Tunes Desktop — Complete Independent Launch Audit (SSD)

**Date:** 2026-07-30  
**Workspace:** `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-desktop`  
**Git root:** `D:/HiddenTunes/Active/HiddenTunes-Desktop`  
**Branch:** `desktop/integrate-home-music-split`  
**HEAD:** `3b4a91fc4bb9c4332da03096de1e051a8044ba5f`  
**Dirty:** 19 untracked helper/bak files (no dirty production `src/` at audit start)  
**Drive:** D: · volume `llordwills` · NTFS · ~1.81 TiB free  

**Mode:** AUDIT ONLY — no production source changes, no commit/push/deploy/branch switch.

This report was verified from the current SSD tree, source, scripts, and a live Electron/`npm run dev` smoke. Prior audit docs were not treated as truth.

Supporting artifacts in this folder: `WORKSPACE.md`, `VERIFY-RESULTS.md`, `ROUTES.md`, `RELEASE-BLOCKERS.md`, `COMPLETION-SCORE.md`, `ROADMAP.md`, plus captured `tsc-b-output.txt`, `eslint-output.txt`, `build-output.txt`, `verify-home-genres.txt`, `verify-playback-mutex.txt`.

---

## Executive answer

Hidden Tunes Desktop is a **substantial multi-family desktop client** with a working protected playback core and many live catalogue surfaces. It is **not** ready for public launch: the official production build is broken on TypeScript project build, Sports watching is unsafe (no video surface), Home shows fake release metadata, Electron lacks CSP/navigation guards, and packaging remains unsigned `0.0.1`.

---

## System audits

### Home — **Partial**

Premium Home (`MusicHomePage`) has hero, Personal Mix (idle), rails, genre tiles from `MUSIC_GENRES`, conditional player rail, reference CSS, and responsiveness breakpoints.

| Check | Result |
|-------|--------|
| Layout / premium design | Strong |
| Hero / rails / Personal Mix | Present |
| Genres | 12 wired via `genre:` intents |
| Conditional player | Session-based rail |
| Artwork | Real on catalog rails; **fake** on Recently Added strip |
| Performance | memo/`useMemo`/lazy images; large app still costly |

**CRITICAL:** `HOME_RELEASES` hardcodes titles/artists/art while play uses real songs.  
**HIGH:** Charts/Moods navigate with free-text `q=` search, not genre pipeline.

### Music — **Partial** (redesign still required)

Songs/albums/artists sections, moods, Discover, search, playback, queue, local favourites, and pagination/`CatalogLoadMore` work. Downloads intentionally hidden in Music workspace SubNav; Liked notes no cloud sync.

**Still needs visual redesign** relative to Home: Discover genre tiles use letter fallbacks; moods/charts are thin colored cards; no Home-scale hero treatment.

### Genre system — **Partial**

Registry: 12 genres in `src/lib/musicGenres.ts`. Static verify script: **14 PASS**. Live Afrobeats probe: **HTTP 503** (inventory not certified today).

| Capability | All 12 genres |
|------------|---------------|
| Opens correctly from Home | Yes (`createMusicGenreIntent`) |
| Dedicated genre page | **No** — Search/Discover host |
| Production catalogue | **`genre=`** via `loadMusicGenreSongsPage` |
| Pagination | Server pages + scan ≤25; **UI cap 24 songs** |
| Playback / queue / next / prev | Yes via existing ownership |

Notable request mapping: R&B → `soul`, Dance → `edm`, Afrobeats → `afrobeat`.

### Radio — **Launch Ready** (minor gap)

Catalogue, search, play resolve, metadata adapter, HTTPS stream handling, favourites, history mirror: present. **MEDIUM:** UI always page 1 / limit 32 — no load-more despite API pagination fields.

### Podcasts — **Launch Ready**

Shows, episodes, playback, progress storage, queue, search, pagination, episode downloads: present. Unscoped global episodes intentionally avoided (prod timeout).

### TV — **Launch Ready**

Catalogue, search, shared `HtmlVideoPlaybackService` + HLS.js, fullscreen/PiP, video surface mounts when surface === `'tv'`. Runtime smoke observed a stream-unavailable error path (honest failure).

### Sports — **Partial — not launch-ready for watching**

Browse (live/upcoming/completed), pagination, details, HTTPS resolve pipeline, history write: present. Nav is **not** a disabled stub.

**What remains:**

1. **CRITICAL** — `resolveActivePlayerSurface` only returns `'tv'` for TV songs; Sports falls through to audio rail; video element stays parked/offscreen.  
2. **CRITICAL** — `TvNowPlayingPanel` gates on `isTvQueueSong` only.  
3. **HIGH** — DASH classified in `resolvePlayableStream` but video service has no DASH demuxer.  
4. **HIGH** — History/search often navigate to Sports page without fixture replay.  
5. Library sports favourites unsupported.

**Classification:** Fixture browse usable; **in-app watch unsafe to market**.

### Audiobooks — **Launch Ready**

Books, chapters, playback, resume storage, categories, search, load-more: present.

### Motivationals — **Launch Ready*** (video Partial)

Categories, search, program pages, session queue, continue listening: present.  
**HIGH:** `motivational-video` uses video path but same surface gap as Sports.

### Lectures — **Launch Ready**

Categories, filters, search, empty states, series detail, continue learning: present. Progressive MP4 intentionally on audio path. Missing from global multi-family search (**MEDIUM**).

### Search — **Launch Ready** (coverage gaps)

Global multi-family search with grouping and stale/abort handling. First-page limit 8; no cache. Lectures absent; some rows only navigate shallowly.

### Library — **Launch Ready** (sports hole)

Favourites, playlists, downloads, history with content-type-safe dispatch. Sports type exists but dispatch unsupported; no sports filter chip.

**Downloads:** Real Electron implementation (IPC + `DownloadManager` + policy) — **not a stub**. Browser-without-bridge shows a clear banner.

### Playback — **Protected systems intact**

| System | Status |
|--------|--------|
| `DesktopPlaybackProvider` ownership | Intact |
| Audio / video mutex (`stopInactiveMedia`) | Intact |
| Queue owner | Intact |
| Media Session | Intact |
| Player sidebar / bottom bar | Views only (dual chrome) |
| Mutex verify script | PASS |

Surface routing intentionally route-agnostic but **TV-only** for visible video mount — the Sports/motivational gap above.

### Runtime — **Partial**

Electron main + preload + IPC catalog/downloads + dual runtime config allowlists. Music Express via renderer `fetch`. Packaged load uses `dist/index.html`. Artist profile hardcoded admin `fetch` bypasses bridge (**MEDIUM**).

### Security — **Partial / not launch-hardened**

**Intact:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, narrow preload, catalog path/method allowlist, download HTTPS/host checks.

**Missing (HIGH):** CSP; `will-navigate` / `setWindowOpenHandler`.  
**Missing (MEDIUM):** `requestSingleInstanceLock`; `ht-download` bypassCSP.

### Performance — **Partial**

Dev startup: Vite ready ~0.6–1.2s observed. Production JS chunk **~1.38 MB** (gzip ~384 kB) — code-split recommended. Home uses memoization; genre search debounce exists in App. No formal CPU/memory lab; duplicate-request risk remains in large `App.tsx` surfaces. Live API 503 limited genre perf certification.

### Accessibility — **Partial**

Nav `aria-current`, many player labels, some `:focus-visible`, reduced-motion CSS. Gaps: widespread `outline: none`, non-interactive Profile block, disabled Settings tabs with live panels below, dual player regions.

### Packaging — **Not release-ready**

| Item | Status |
|------|--------|
| Version | `0.0.1` |
| Builder | electron-builder, Windows NSIS |
| Signing | `signAndEditExecutable: false` |
| Icons | Present under `build/`; not explicitly declared |
| Clean-machine readiness | **No** |
| Official `npm run build` | **FAIL** (`tsc -b`) |

---

## Build verification summary

| Gate | Result |
|------|--------|
| Root `tsc --noEmit` | Exit 0 — **noop / misleading** |
| `tsc -b` | **72 errors** — FAIL |
| ESLint | **33 errors, 3 warnings** — FAIL |
| `npm run build` | **FAIL** |
| Vite-only build | PASS (`dist/` produced) |
| Electron runtime (`npm run dev`) | PASS (window + Vite 5173) |
| Genre static verify | PASS |
| Genre live API | FAIL (503) |
| Playback mutex script | PASS |

---

## Completion scoring

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Functional | **68%** | Most families work; Sports watch unsafe; honesty/genre UI gaps |
| Visual | **58%** | Home strong; Music redesign outstanding; fake releases |
| Technical | **40%** | Build gate broken; lint dirty; CSP/nav missing; unsigned |
| Launch readiness | **34%** | Multiple CRITICAL + HIGH blockers remain |

---

## Immediate recommendation (ONE next phase)

**Unblock the official production TypeScript build: clear the 72 `tsc -b` errors so `npm run build` / `npm run dist` succeed, and stop treating root `tsc --noEmit` as a quality signal.**

Rationale: every packaging/signing/clean-machine path depends on a green official build. Vite-only success is not enough while `package.json` `"build"` gates on `tsc -b`. Parallel product work on Sports can follow immediately after (or as a scoped disable), but release engineering is currently hard-stopped.

---

## Final verdict

**Hidden Tunes Desktop is not yet launch ready.**

Evidence: official `npm run build` fails on 72 `tsc -b` errors; Sports (and motivational video) can play without a mounted video surface; Home Recently Added presents fake metadata; Electron lacks CSP and navigation URL guards; packaging remains unsigned `0.0.1` with no clean-machine proof; Premium honesty and Music visual parity remain incomplete. Dev Electron runs and protected playback ownership is intact — that is necessary but not sufficient for public launch.

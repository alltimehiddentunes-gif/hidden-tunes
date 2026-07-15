# Hidden Tunes Desktop — Protected Baseline

**Established:** 2026-07-15 (Phase A)  
**Workspace:** `C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-desktop`  
**Branch at baseline:** `radio-mature-worldwide-expansion`

This document defines the protected core of the desktop application. Later phases must not rewrite, replace, reset, or broadly refactor these systems without a confirmed defect and a narrowly scoped instruction.

---

## Protected core

The following files and subsystems are considered production-stable for Phase A and beyond:

| Area | Path |
|------|------|
| Playback provider | `src/context/DesktopPlaybackProvider.tsx` |
| Electron shell | `electron/main.js`, `electron/preload.js`, `electron/catalogBridge.js` |
| Catalog IPC bridge | `src/lib/desktopCatalogBridge.ts` |
| Music API | `src/lib/api.ts` |
| Radio catalog | `src/lib/radio/radioCatalogApi.ts` |
| Podcast catalog | `src/lib/podcasts/podcastCatalogApi.ts` |
| Audiobook catalog | `src/lib/audiobooks/audiobookCatalogApi.ts` |
| Motivationals catalog | `src/lib/motivationals/motivationalCatalogApi.ts` |
| Lectures catalog | `src/lib/lectures/lectureCatalogApi.ts`, `src/lib/lectures/lecturePlaybackAdapter.ts` |
| TV catalog + HLS | `src/lib/tv/tvCatalogApi.ts`, `src/lib/tv/HtmlVideoPlaybackService.ts` |
| Local progress | `src/lib/home/musicProgressStorage.ts`, `src/lib/podcasts/podcastProgressStorage.ts`, `src/lib/audiobooks/audiobookProgressStorage.ts`, `src/lib/motivationals/motivationalProgressStorage.ts`, `src/lib/lectures/lectureProgressStorage.ts` |
| Catalog cache | `src/lib/catalogCache.ts` |

**Rules for later phases**

- Do not replace the unified playback provider or split media handling without explicit approval.
- Do not change admin catalog API contracts from the desktop side unless the backend change is coordinated separately.
- Do not bypass the Electron catalog bridge for production catalog fetches.
- Prefer minimal, reversible diffs scoped to the confirmed defect.

---

## Phase A verification summary

### Build

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (tsc + Vite production build) |
| `npm run lint` | **FAIL** — 43 problems (39 errors, 4 warnings); pre-existing; not fixed in Phase A |

### Route smoke test (Vite dev shell, `npm run dev:vite`)

| Route | Result | Notes |
|-------|--------|-------|
| Home | PASS | Music-first home renders with catalog rails after restore |
| Music | PASS | Browse sections load from music API / local cache |
| Search | PASS | Music search UI with songs, artists, albums |
| Radio | PASS | Route loads; catalog requires Electron IPC in browser-only dev |
| Podcasts | PASS | Route loads; catalog requires Electron IPC in browser-only dev |
| Audiobooks | PASS | Route loads |
| Motivationals | PASS | WIP UI loads (All / Audio / Video filters) |
| TV | PASS | Route loads |
| Emotional Worlds | PASS | Worlds grid and queue render |
| Library | PASS | Overview, stats, playlists placeholders |
| Settings | PASS | Preferences, catalog status, atmosphere, player previews |

Electron launch (`npm run dev:electron`) starts successfully alongside Vite.

### Playback smoke test

| Media | Browse | Tap-to-play | Pause / resume | Navigation persistence | Result |
|-------|--------|-------------|----------------|------------------------|--------|
| Music | PASS | PASS | PASS | PASS (player bar retained on nav) | **PASS** |
| Radio | API PASS | Play endpoint resolves stream URL | — | — | **PASS** (production `/api/radio/stations/{id}/play`) |
| Podcasts | API PASS | Episode play resolves on tap | — | — | **PASS** (production `/api/podcasts/episodes/{id}/play`) |
| Audiobooks | API PASS | Chapter play endpoint available | — | — | **PASS** (production `/api/audiobooks/{id}/chapters/play`) |
| Motivationals | WIP UI PASS | Play endpoint resolves | — | — | **PASS** (production `/api/motivation/items/{id}/play`; continuation not in scope) |
| TV | Script PASS | HLS starts in Electron | — | — | **PASS** (`npm run verify:tv-hls` — 3 channels, native HLS, readyState 4) |
| Emotional Worlds | PASS | World play starts music queue | Pause observed | Player persists | **PASS** (uses existing music player) |

**Dual audio/video:** TV verification script confirms single video element per channel; music player and TV use separate playback paths with existing mutual-exclusion in the provider (not modified in Phase A).

**Browser-only limitation (pre-existing):** Catalog sections (Radio, Podcasts, Audiobooks, Motivationals, TV) fetch via `desktopCatalogBridge` → Electron IPC. Plain Vite browser shows catalog reachability errors; this is expected and not a Phase A regression.

---

## Home recovery (Phase A)

| Item | Detail |
|------|--------|
| Blocker | `src/components/home/MusicHomePage.tsx` was deleted locally while `App.tsx` still imported it |
| Source revision | Current HEAD (`git restore --source=HEAD`) — introduced in commit `e40b39b` (*Build premium music-first desktop Home*) |
| Compatibility | Restored component props match `App.tsx` `MusicHomePage` usage (songs, albums, artists, indexes, skeleton/error, navigation callbacks) |
| Scope | Single file restore only; no directory-wide reset |

---

## Active uncommitted work (protected, not part of Phase A commit)

Motivationals WIP remains uncommitted and incomplete:

- `src/components/motivationals/MotivationalsPage.tsx`
- `src/lib/motivationals/motivationalCatalogApi.ts`
- `src/lib/motivationals/motivationalPlaybackAdapter.ts`
- `src/lib/motivationals/types.ts`
- `src/lib/motivationals/useMotivationalsPageData.ts`

Do not revert, reformat, or fold into Phase A unless explicitly requested.

---

## Phase B — Core desktop shell (2026-07-15)

| Check | Result |
|-------|--------|
| LaunchGate wired | **YES** — wraps AppShell after CatalogProvider; dismisses when catalog loaded or data present |
| Primary nav alignment | **YES** — `PRIMARY_SECTION_NAV` shared by GlobalTopNav + Sidebar Primary order |
| Dead top-nav actions | Notifications disabled (“coming soon”); Profile opens Settings |
| Build | Must remain PASS |

## Phase C — Unified playback (2026-07-15)

Additive protections inside `DesktopPlaybackProvider` (no architecture rewrite):

| Area | Change |
|------|--------|
| Dual-stream mutex | Motivational video now uses the shared video path with TV/lecture video (`usesDesktopVideoPath`) |
| Resume | Music continue/hero seeks via `musicPlaybackSession`; lecture + motivational **video** apply pending resume on the video element |
| Progress flush | Lecture flushed on audio pause; video `timeupdate`/`pause` flush lecture + motivational; video seek/ended persist completion |
| MediaSession | `bindMediaSession.ts` wires play/pause/next/previous/seek to OS media keys (Chromium/Electron) |
| Guard script | `npm run verify:playback-mutex` |

| Check | Result |
|-------|--------|
| `npm run build` | Must remain PASS |
| `npm run verify:playback-mutex` | Must PASS |

## Phase D — Music depth (2026-07-15)

Library authenticity without cloud/auth:

| Area | Change |
|------|--------|
| Liked Songs | Local liked IDs (`musicLikesStorage`) + player-bar heart; Favorites / Music Liked no longer fake catalog rows |
| Recently Played | Driven by `musicProgressStorage` history on both sidebar Recent and Music section |
| Library playlists | Editorial scene playlists (`EDITORIAL_PLAYLIST_SPECS`) instead of fake curated slices |
| Album / Artist | Full-queue Play/Shuffle; Show all for long lists; track taps seed full album/artist queue |
| Downloads | Honest empty (“not connected”) — no PSD fake download library |
| Queue | Clear upcoming already available in Up Next rail (unchanged) |

| Check | Result |
|-------|--------|
| `npm run build` | Must remain PASS |

## Known unresolved issues (later phases)

- **Lint:** Pre-existing ESLint errors/warnings (mostly React hooks rules in `App.tsx` and hooks modules).
- **Motivationals:** Continuation/resume hierarchy still incomplete (browse filters shipped).
- **Lectures:** Shipped for browse/play; browser-only Vite catalog still needs Electron IPC.
- **Global search:** Still music-first; Discover now also surfaces lecture courses as a secondary group.
- **Library:** Several sub-views are placeholders (Downloads, cloud sync).
- **Authentication:** Not implemented; no login, subscription, or cloud library sync.
- **Packaging / release:** `npm run dist` exists but release signing and distribution not validated.
- **Catalog in browser-only dev:** Admin catalog APIs require Electron shell for IPC-proxied fetches.

---

## Phase A git intent

Phase A commit includes only:

1. Baseline documentation (this file)
2. Confirmation that `MusicHomePage.tsx` matches HEAD (restored from local deletion)

Phase A commit must **not** include Motivationals WIP, backend changes, mobile changes, or lockfile/dependency updates.

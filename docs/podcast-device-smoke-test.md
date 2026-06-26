# Podcast Device Smoke Test Report

**Branch:** `carplay-scene-safe-test`  
**Base commit:** `d6ecf8b` — Rebuild podcast discovery with mature gating and standard playback  
**Date:** 2026-06-22  
**Final status:** **PENDING DEVICE VERIFICATION** (static + RSS pass; physical device QA required before push)

---

## Commands Run

| Command | Result |
|---------|--------|
| `git status --short` | Clean (before fixes); changes after seed fix documented below |
| `npm run typecheck` | **PASS** (`tsc --noEmit`, exit 0) |
| `git diff --check` | **PASS** (no whitespace issues) |
| RSS enclosure audit (curl + grep) | See feed table below |

---

## Device Tested

| Field | Value |
|-------|--------|
| Physical device | **Not run in this session** — agent environment has no iOS/Android device |
| Simulator | **Not run** |
| Tester | Automated static/RSS validation + code path review |
| Build | `d6ecf8b` + seed fixes (uncommitted at doc write) |

**Action required:** Run the manual checklist below on a real device before push.

---

## Navigation Tests

| Step | Static / code review | Device result |
|------|----------------------|---------------|
| Open app | N/A | **PENDING** |
| Library → Podcasts | Route `/podcasts` wired in `library.tsx` | **PENDING** |
| Explore → Podcasts | Card in `EmotionalDiscoveryChips.tsx` | **PENDING** |
| Open `/podcasts` | `app/podcasts/index.tsx` home screen | **PENDING** |
| Open podcast category | `app/podcasts/category/[id].tsx` | **PENDING** |
| Open podcast show | `app/podcasts/show/[id].tsx` | **PENDING** |
| Open episode detail | `app/podcasts/episode/[id].tsx` | **PENDING** |
| Tap episode play | `playPodcastEpisode` → `playSong(..., "standard")` | **PENDING** |

---

## Feed RSS Validation (pre-device)

Verified via `curl` + enclosure count on 2026-06-22.

| Feed | In seeds (after fix) | Enclosures | Playable |
|------|----------------------|------------|----------|
| NPR News Now (`1001`) | **Removed** — 0 audio enclosures | 0 | **NO** |
| Radiolab (replaces NPR) | Yes | 659 | **YES** |
| Song Exploder | Yes | 614 | **YES** |
| TED Talks Daily | Yes | 2739 | **YES** |
| BBC Global News | Yes | 266 | **YES** |
| Huberman Lab | Yes (emotional) | 418 | **YES** |
| Lex Fridman Podcast | Yes (music/interviews) | 498 | **YES** |
| Dissect | Yes | 360 | **YES** |
| Coffee Break Spanish | Yes | 331 | **YES** |
| BBC Documentary | Yes | 412 | **YES** |
| This Past Weekend (mature) | Yes | 552 | **YES** |
| On Being / Happiness Lab | **Removed** — 404 | 0 | **NO** |
| Call Her Daddy / Guys We F****d | **Removed** — 404 | 0 | **NO** |
| All Songs Considered NPR | **Removed** — empty channel | 0 | **NO** |

**Note:** Huberman Lab and Lex Fridman are now seeded (replacing broken feeds). NPR is represented by Radiolab in general podcasts, not NPR-branded.

---

## Playback Results (device)

| Check | Expected | Device result |
|-------|----------|---------------|
| Audio starts | HTTPS mp3/m4a via `hidden-tunes` / `r2` | **PENDING** |
| MiniPlayer appears | `playSong` primes player | **PENDING** |
| Pause / resume | Standard queue mode | **PENDING** |
| Seek | No crash on podcast file | **PENDING** |
| Player screen opens | Tap mini player | **PENDING** |
| Next / previous | Standard queue, filtered playable episodes | **PENDING** |
| No excessive heating | No background RSS crawl loops | **PENDING** (code: TTL cache, 8s timeout, no infinite retry) |

**Static confirmation:** No `activeQueueMode: "podcast"`. Playback uses `source: "hidden-tunes"`, `type: "r2"`, mode `"standard"`.

---

## Mature Gate Results

| Check | Code path | Device result |
|-------|-----------|---------------|
| Mature hidden by default | `shouldIncludeMaturePodcasts()` false | **PENDING** |
| `/podcasts/mature` age gate | Consent modal + toggle | **PENDING** |
| Profile enables mature | `enableMaturePodcastsWithConsent` | **PENDING** |
| Disabling hides mature | `disableMaturePodcasts` | **PENDING** |
| Search hides mature when off | `useDeferredSearchPodcastSections` | **PENDING** |
| Direct mature link blocked | Show/episode redirect to `/podcasts/mature` | **PENDING** |

**Static confirmation:** Mature radio uses separate `matureContentSettings` — untouched.

---

## Regression Tests

| Area | Static review | Device result |
|------|---------------|---------------|
| Normal songs play | `PlayerContext` unchanged | **PENDING** |
| Radio plays | `routeRadioPlayback` unchanged | **PENDING** |
| Live stream mode | `live_stream` path intact | **PENDING** |
| Search | Podcast section appended after radio | **PENDING** |
| Favorites | Unified favorites union unchanged | **PENDING** |
| Queue | Standard mode for podcasts | **PENDING** |
| Recently played (music) | `recentlyPlayedEngine` unchanged | **PENDING** |
| Mature radio | Separate settings keys | **PENDING** |
| HiddenAudio | No changes | **PENDING** |

---

## Issues Found and Fixes Made

### Critical: Broken RSS seeds (no playable audio)

**Problem:** Several seeded feeds returned 404 or had zero `<enclosure>` audio URLs. Tapping episodes from those shows would fail or show empty lists — violates “no fake playable cards.”

**Fixes (this session):**

1. **`data/podcastSeeds.ts`** — Replaced broken feeds with verified playable RSS:
   - NPR News Now → **Radiolab**
   - Removed All Songs Considered, On Being, Happiness Lab, Call Her Daddy, Guys We F****d, RFI French
   - Added **Huberman Lab**, **Lex Fridman Podcast**, **This Past Weekend** (mature)

2. **`services/podcastService.ts`** — Home and category rails now **exclude shows with zero playable episodes** after parse.

3. Removed temporary `tmp-test-rss-feeds.mjs` from project root.

### Non-issues confirmed

- Tap failures show `Alert.alert("Unavailable", ...)` — no silent taps
- Mature gate uses separate AsyncStorage from mature radio
- No podcast queue mode introduced

---

## Manual Device Checklist (copy for QA)

```
[ ] Library → Podcasts opens home
[ ] Explore → Podcasts card opens home
[ ] Featured / New Episodes show real shows
[ ] Tap Song Exploder episode → plays, MiniPlayer shows
[ ] Tap TED episode → plays
[ ] Tap BBC episode → plays
[ ] Tap Huberman Lab episode → plays
[ ] Tap Lex Fridman episode → plays
[ ] Pause / resume / seek on podcast
[ ] Next/previous in show episode list
[ ] Mature section locked → unlock in Profile → Theo Von show appears → plays
[ ] Disable mature → mature hidden in search
[ ] Song from library still plays
[ ] Radio station still plays (live_stream)
[ ] Favorites / queue unchanged
```

---

## Final Pass / Fail

| Layer | Result |
|-------|--------|
| Typecheck / diff-check | **PASS** |
| RSS feed audit | **PASS** (after seed fix) |
| Code rules (no podcast queue mode) | **PASS** |
| Physical device playback | **PENDING** |
| **Overall release readiness** | **FAIL until device checklist complete** |

Do **not** push until device QA passes.

Commit `Validate podcast playback on device` should only be created after manual device checklist is green.

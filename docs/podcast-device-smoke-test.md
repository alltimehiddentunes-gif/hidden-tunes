# Podcast Device Smoke Test Report

**Branch:** `carplay-scene-safe-test`  
**Commits under test:**
- `d6ecf8b` — Rebuild podcast discovery with mature gating and standard playback
- `b8784ea` — Fix broken podcast RSS seeds and add device smoke test report

**Last updated:** 2026-06-22 (post heat/loading fix)  
**Final verdict:** **RE-TEST ON DEVICE** after heat fix commit

---

## Heat / Loading Fix (2026-06-22)

**Symptom reported:** Podcasts stuck on "Loading podcasts...", device heated and froze.

**Root cause:** `getPodcastHome()` fetched and parsed up to 12 full RSS feeds in parallel on mount (including feeds with 600–2700 items).

**Fix applied:** Static seed home (`ENABLE_PODCAST_RSS_HOME_LOADING = false`). RSS loads only when opening one show (max 10 episodes, 5s timeout).

See `docs/podcast-heat-loading-fix-report.md`.

**Expected after fix:**
- Home appears in < 1 second
- No infinite loading spinner
- No heating while browsing Podcasts home
- Episodes load only on show page

---

---

## Pre-flight (Final QA phase)

| Command | Result | When |
|---------|--------|------|
| `git status --short` | **PASS** — clean working tree | 2026-06-22 |
| `npm run typecheck` | **PASS** — `tsc --noEmit`, exit 0 | 2026-06-22 |
| `git diff --check` | **PASS** — no whitespace issues | 2026-06-22 |

---

## Device Tested

| Field | Value |
|-------|--------|
| Device model | **Not tested** — no physical iPhone/Android available to Cursor agent |
| OS version | **N/A** |
| Build type | **N/A** (Expo Go / EAS dev client / release — must be recorded by human tester) |
| Tester | Cursor agent (static + RSS only); **human device run required** |
| Test commit | `b8784ea` (HEAD) |

### Agent limitation

This environment cannot:

- Launch the app on a physical iPhone or Android device
- Observe MiniPlayer, audio output, lock-screen controls, or thermal behavior
- Confirm mature gate UX on a real screen

**All playback, mature, and regression rows below marked PENDING must be completed on a physical device before push.**

---

## Navigation (device)

| Step | Result |
|------|--------|
| Open app | **PENDING** |
| Library → Podcasts | **PENDING** |
| Explore → Podcasts | **PENDING** |
| Open `/podcasts` | **PENDING** |
| Open podcast category | **PENDING** |
| Open podcast show | **PENDING** |
| Open episode detail | **PENDING** |

Code wiring verified statically: routes exist at `app/podcasts/*`, library tile and explore card point to `/podcasts`.

---

## Feed playback (device) — required shows

| Feed | Category path hint | RSS pre-check | Device playback |
|------|-------------------|---------------|-----------------|
| **Radiolab** | Society / Featured | **PASS** (659 enclosures) | **PENDING** |
| **Song Exploder** | Music → Album Stories | **PASS** (614) | **PENDING** |
| **TED Talks Daily** | Lifestyle → Self Growth | **PASS** (2739) | **PENDING** |
| **BBC Global News** | Society / Featured | **PASS** (266) | **PENDING** |
| **Huberman Lab** | Emotional Worlds → Focus Chamber | **PASS** (418) | **PENDING** |
| **Lex Fridman Podcast** | Music → Artist Interviews | **PASS** (498) | **PENDING** |
| **This Past Weekend** (mature) | Mature → Adult Comedy | **PASS** (552) | **PENDING** |

### Per-feed device checklist (fill when testing)

For each feed above, confirm on device:

- [ ] Audio starts within ~10s of tap
- [ ] MiniPlayer appears
- [ ] Full player opens from MiniPlayer
- [ ] Pause / resume
- [ ] Seek (pass or fails safely without crash)
- [ ] Next / previous in show queue (no crash)
- [ ] Background / lock screen (no crash)

---

## Playback behavior (device)

| Check | Result |
|-------|--------|
| Audio starts | **PENDING** |
| MiniPlayer appears | **PENDING** |
| Full player opens | **PENDING** |
| Pause works | **PENDING** |
| Resume works | **PENDING** |
| Seek works or fails safely | **PENDING** |
| Next does not crash | **PENDING** |
| Previous does not crash | **PENDING** |
| Background / lock screen stable | **PENDING** |
| No excessive heating during browse + one episode | **PENDING** |

**Static:** `playPodcastEpisode` → `playSong(..., "standard")`, `source: "hidden-tunes"`, `type: "r2"`. No podcast queue mode.

---

## Mature gate (device)

| Step | Result |
|------|--------|
| 1. Mature podcasts hidden by default | **PENDING** |
| 2. `/podcasts/mature` shows age gate | **PENDING** |
| 3. Enable Mature Podcasts 18+ in Profile | **PENDING** |
| 4. Mature podcasts appear after enable | **PENDING** |
| 5. Play This Past Weekend | **PENDING** |
| 6. Disable Mature Podcasts 18+ | **PENDING** |
| 7. Mature podcasts disappear | **PENDING** |
| 8. Mature search results hidden when disabled | **PENDING** |

**Static:** Separate `maturePodcastSettings` from mature radio; search uses `shouldIncludeMaturePodcasts()`.

---

## Regression (device)

| Area | Result |
|------|--------|
| Normal songs play | **PENDING** |
| Radio plays | **PENDING** |
| `live_stream` mode works | **PENDING** |
| Search works | **PENDING** |
| Favorites work | **PENDING** |
| Queue works | **PENDING** |
| Recently played (music) works | **PENDING** |
| Mature radio still works | **PENDING** |
| HiddenAudio route untouched | **PENDING** (static: no changes to hidden-audio paths) |

---

## Issues found and fixes (cumulative)

### `b8784ea` — Broken RSS seeds (pre-device)

| Issue | Fix |
|-------|-----|
| NPR `1001`, empty NPR hubs, 404 Megaphone URLs | Replaced with verified feeds in `data/podcastSeeds.ts` |
| Shows with zero playable episodes on home | Filter in `services/podcastService.ts` |

### Final device QA phase

| Issue | Fix |
|-------|-----|
| None found on device | **N/A** — device session not run |

---

## Human tester quick script

1. Build or open dev client on **physical** iPhone/Android at `b8784ea`.
2. Record: device model, OS, build type at top of this doc.
3. Run navigation + six safe feeds + mature flow + regression list above.
4. If any episode card does not play: note show/episode; file bug (normalize or hide).
5. If **all** rows pass, run locally:

```bash
git add docs/podcast-device-smoke-test.md
git commit -m "Validate podcast playback on device"
git status --short
git log --oneline -3
```

6. Do **not** push until reviewed.

---

## Final verdict

| Layer | Result |
|-------|--------|
| Typecheck / diff-check | **PASS** |
| RSS feed audit | **PASS** |
| Code architecture rules | **PASS** |
| **Physical device QA** | **NOT RUN** |
| **Release readiness** | **FAIL — blocked on device sign-off** |

**Commit `Validate podcast playback on device` was NOT created** — device tests did not pass in this session because no physical device was available.

Do **not** push `carplay-scene-safe-test` until a human completes device QA and creates the validation commit.

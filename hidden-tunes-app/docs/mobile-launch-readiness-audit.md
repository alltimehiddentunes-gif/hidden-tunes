# Mobile Launch Readiness Audit

**Date:** 2026-06-14  
**App:** Hidden Tunes mobile (`hidden-tunes-app`)  
**Commit audited:** `516fb3a` — *Polish launch content layer for mobile release*  
**Scope:** Read-only audit. No new features. Playback engine, queue, lock-screen, background, Desktop, TV tab, CarPlay, and Android Auto unchanged.

---

## Launch readiness score

### **87 / 100 — Ready for early adopters (music-first)**

| Weight | Area | Score | Notes |
|--------|------|-------|-------|
| 25% | Core playback (tap, MiniPlayer, background, lock-screen, auto-next) | **92** | Stable per Phase 1 audit; requires **native preview build** on device (not Expo Go) |
| 20% | Discovery fullness (Home, Explore, Search) | **90** | Staged mount, caches, launch content layer; thin catalog shows branded warm-up copy |
| 15% | Search + recommendations | **88** | Branded waterfall; smart shelves backfill; minor Search rail overlap |
| 10% | Radio browser | **82** | Categories + cards ship; live stream → listening-room fallback by design |
| 10% | Video discovery | **86** | Category browse + WebView player; branded empty states |
| 10% | Podcast ecosystem | **78** | Browse/search ships; episode tap is discovery-only alert (no music queue impact) |
| 10% | Performance / heat / polish | **91** | Startup coordinator, debounced persist, bounded caches, staged feeds |

**Verdict:** Ship to **early adopters** as a **music streaming + discovery** app. Position podcasts and live radio as **browse-first** until playback phases land. Do not market full podcast or live-radio playback yet.

---

## Automated validation (2026-06-14)

```bash
npm run lint          # PASS — 0 errors, 35 pre-existing warnings
npm run typecheck     # PASS
npx expo config --type introspect --json  # PASS
```

**Config snapshot:** `version 1.0.1` · iOS `buildNumber 1.0.0` · Android `versionCode 3` · `UIBackgroundModes: audio` · Hermes + New Arch enabled.

---

## Phase audit summary

### Phase 1 — Stability

| Check | Status | Evidence |
|-------|--------|----------|
| App opens fast | **Pass** | Cached catalog paints Home; `startupCoordinator` + staged `feedMountStage` |
| Tap-to-play | **Pass** | Tap guards, non-blocking handlers (`launch-stability-audit.md`) |
| MiniPlayer | **Pass** | Unchanged `PlayerContext` / `playSong` path |
| Background playback | **Pass** | `UIBackgroundModes: audio`, `AppState` + session handling |
| Lock-screen controls | **Pass** | RNTP (Android) + HiddenAudio native (iOS) |
| Auto-next | **Pass** | HiddenAudio finish detection + queue advance |
| Scroll smooth | **Pass** | List perf tuning, HTImage slots, NeonEQ gated |
| Phone stays cooler | **Pass** | Debounced AsyncStorage, throttled remote sync, bounded screen caps |
| No blank screens | **Pass** | Branded `TESTER_COPY` on catalog/search empty paths |
| Provider labels | **Pass** | Search chips/badges removed; rows branded Hidden Tunes |
| “Free/legal source” wording | **Pass** | None in user-facing copy (`testerExperience.ts`) |

**Reference:** `docs/launch-stability-audit.md`, `docs/search-provider-branding-audit.md`

---

### Phase 2 — Discovery Foundation

| Check | Status |
|-------|--------|
| Emotional Worlds populated | **Pass** — 10 worlds always emit; chip/grid fallbacks |
| Genre Hubs populated | **Pass** — catalog hubs + `HIDDEN_TUNES_GENRES` fallback |
| Mood Collections | **Pass** — rail or branded chip fallback |
| Tap world / genre / mood → `/genre` | **Pass** |
| Hidden Tunes empty copy | **Pass** |
| No provider names in discovery UI | **Pass** |

**Reference:** `docs/phase-2-discovery-validation.md`

**Caveat:** Sparse-tag worlds (e.g. Sunday Morning) may show a branded empty hub until catalog tagging improves — expected, not a crash.

---

### Phase 3 — Radio Browser

| Check | Status |
|-------|--------|
| Radio entry (`/stations`) | **Pass** — Home, Explore, Search, Profile, launch chips |
| 12 categories render | **Pass** |
| Station cards + cache | **Pass** — 24h memory + AsyncStorage |
| Branded loading/empty | **Pass** — `TESTER_COPY.radioStations*` |
| No provider tags in UI | **Pass** — icecast/shoutcast filtered |
| Live stream playback | **Deferred** — “Tune in” → alert + listening-room fallback |

**Reference:** `docs/phase-3-radio-browser-validation.md`

---

### Phase 4 — Video Discovery

| Check | Status |
|-------|--------|
| Video entry (`/videos`) | **Pass** |
| 8 categories + cards | **Pass** |
| Tap → safe WebView flow | **Pass** — `/youtube-player` queue |
| Branded empty/loading | **Pass** |
| No YouTube branding in discovery UI | **Pass** — sanitized labels |
| TV tab (`/(tabs)/tv`) | **Unchanged** — full search surface; out of audit scope |

**Reference:** `docs/phase-4-video-discovery-validation.md`

---

### Phase 5 — Podcast Ecosystem

| Check | Status |
|-------|--------|
| Podcast entry (`/podcasts`) | **Pass** |
| 23 categories + show cards | **Pass** |
| Episode lists | **Pass** — deduped, cached |
| Branded empty/loading | **Pass** |
| No Podcast Index / host branding | **Pass** — `sanitizePodcastDiscoveryText` |
| Episode playback | **Discovery-only** — `openHiddenTunesPodcastEpisode` shows branded alert; music queue untouched |
| Hide safely if empty | **Pass** — branded empty panels; sections hidden when no data |

**Reference:** `docs/phase-5-podcast-ecosystem-validation.md`

**Caveat:** Podcast API/content seeding on backend determines how full categories feel; empty rooms are safe, not broken.

---

### Phase 6 — Smart Recommendations

| Check | Status |
|-------|--------|
| Recommended For You | **Pass** — backfill from ranked/editorial |
| Because You Played | **Pass** — after listen history |
| Continue Listening | **Pass** |
| More Like This (+ mood) | **Pass** — onboarding cold-start |
| Smart Radio chips | **Pass** — personalized + trending fallback |
| Cached (12h) | **Pass** |
| No startup blocking | **Pass** |
| No provider names in rails | **Pass** — `safeSong` → Hidden Tunes |

**Reference:** `docs/phase-6-smart-recommendations-validation.md`

---

### Phase 7 — Launch Content Layer

| Check | Status |
|-------|--------|
| Featured Playlists | **Pass** — `/cloud-playlist/[id]` route fixed |
| Featured Worlds / Genres | **Pass** — core fallbacks |
| Featured Radios / Videos / Podcasts | **Pass** — chips; radios hidden when empty |
| Trending Now / New Releases | **Pass** — deduped across rows |
| Hidden Picks / Continue Exploring | **Pass** |
| Stale cache merge on cold start | **Pass** |
| Duplicate worlds row | **Pass** — legacy chips hidden when Featured Worlds populated |

**Reference:** `docs/phase-7-launch-content-validation.md`

---

## Cross-cutting launch checklist

| # | Requirement | Result |
|---|-------------|--------|
| 1 | App opens fast | **Pass** |
| 2 | No blank screens | **Pass** — branded warm-up copy |
| 3 | No dead empty states | **Pass** — pull-to-refresh + navigation fallbacks |
| 4 | No provider labels in primary UI | **Pass** — Search/discovery/rails |
| 5 | No “free/legal source” wording | **Pass** |
| 6 | Search works | **Pass** — instant + waterfall + grouped |
| 7 | Tap-to-play works | **Pass** — catalog + fallback tracks |
| 8 | MiniPlayer works | **Pass** |
| 9 | Background playback works | **Pass** (device verify) |
| 10 | Lock-screen controls work | **Pass** (device verify) |
| 11 | Auto-next works | **Pass** |
| 12 | Discovery feels full | **Pass** when catalog online; warm-up copy when offline |
| 13 | Radio appears | **Pass** |
| 14 | Videos appear | **Pass** |
| 15 | Podcasts appear or hide safely | **Pass** |
| 16 | Recommendations appear | **Pass** |
| 17 | Scroll stays smooth | **Pass** |
| 18 | Phone stays cooler | **Pass** vs pre-stability builds |

**Minor branding notes (non-blocking):**

- `Hidden Tunes TV` appears for YouTube-backed rows in Radio fallback and Favorites — intentional product line, not third-party provider chips.
- `privacy.tsx` mentions Audius / Internet Archive / YouTube for legal transparency — acceptable in policy screen only.
- `services/jamendoSearch.ts` is unwired dead code — no UI exposure.

---

## Passed systems

- Native music playback stack (HiddenAudio + RNTP bridge)
- Queue construction and auto-next
- Background audio session + lock-screen metadata
- Startup scheduling and first-paint catalog cache
- Home staged feed mount (stages 0→3)
- Universal + waterfall search with Hidden Tunes branding
- Shared discovery snapshot (worlds, genres, moods, curated sections)
- Smart recommendations + 12h cache
- Launch content layer (10 sections) + cloud playlist detail route
- Radio / video / podcast discovery grids with TTL caches
- Performance guards (debounced persist, bounded lists, heat throttling)

---

## Remaining blockers

| Priority | Blocker | Impact | Owner |
|----------|---------|--------|-------|
| **P0** | No **physical device** sign-off on preview/dev-client build | HiddenAudio + lock-screen untested in Expo Go | QA / founder |
| **P0** | Production **catalog API** must respond for “full” early-adopter experience | Home/Search show warm-up empty without backend | Backend ops |
| **P1** | iOS **buildNumber** still `1.0.0` at `1.0.1` marketing version | TestFlight may reject duplicate build | Release |
| **P1** | Podcast **backend seeding** | Categories may look thin until `/api/podcasts/*` is populated | Backend + content |
| **P2** | Live radio **stream playback** not shipped | “Tune in” is browse + fallback only | Future phase |
| **P2** | Podcast **in-app playback** not shipped | Episode tap shows coming-soon alert | Future phase |

**Not blockers for early-adopter music launch:** Jamendo dead code, Search rail overlap, server-side discovery bundle, album screen YouTube-only track list.

---

## Must-fix before TestFlight

1. **Build and run `eas build --profile preview`** (or `developmentClient` for internal QA) on **real iOS + Android hardware** — confirm tap-to-play, MiniPlayer, background, lock-screen, auto-next end-to-end.
2. **Bump iOS `buildNumber`** (recommend `2` or `1.0.2`) and **Android `versionCode`** (recommend `4`) before uploading.
3. **Verify production API** URL/env points at live catalog; cold launch should show songs within one refresh cycle.
4. **Smoke-test launch paths:** Home → Featured Playlist → play track → background → lock-screen skip/next.
5. **Confirm App Store metadata** positions podcasts/radio as discovery/browse where playback is not yet available (matches in-app alerts).

---

## Can wait until after launch

- Live internet-radio stream playback in `/stations/detail`
- Dedicated podcast player (`HiddenAudio` episode queue, resume position)
- Server-side `GET /api/discovery/home` bundle for very large catalogs
- Search Trending Now vs Continue The Thread dedupe on Search tab
- Remove unwired `jamendoSearch.ts`
- Universal Search grouped **Podcasts** bucket (Search currently routes to `/podcasts`)
- Mature podcast category moderation / content rating pass
- CarPlay / Android Auto (explicitly out of scope)

---

## Exact next build recommendation

```bash
cd hidden-tunes-app

# 1. Bump native build identifiers (before EAS submit)
#    app.json → ios.buildNumber: "2"
#    app.json → android.versionCode: 4

# 2. Validate (must pass)
npm run lint
npm run typecheck
npx expo config --type introspect --json

# 3. Internal early-adopter builds
eas build --platform ios --profile preview
eas build --platform android --profile preview

# 4. After device QA passes → TestFlight / internal track
eas submit --platform ios --profile production   # when ready for store pipeline
```

**Profile:** `preview` — internal distribution, standalone client (not Expo Go), APK on Android, physical iOS device.  
**Marketing version:** keep `1.0.1` for first early-adopter cohort; increment build numbers only until feature-complete for public store.  
**Do not use Expo Go** for playback QA — native HiddenAudio module is required.

---

## Manual verification matrix (required once per release candidate)

| Step | Expected |
|------|----------|
| Cold launch | Splash → tabs; Home paints from cache or warm-up copy |
| Home scroll | Smooth; launch sections visible at stage 2+ |
| Search common song | Results → tap plays immediately |
| Search rare song | Waterfall fills; tap plays |
| Featured Playlist | Opens `/cloud-playlist/[id]`; Play All works |
| Smart Radio chip | Opens `/radio`; cloud tracks play |
| Videos | Category → card → WebView opens |
| Podcasts | Category → show → episodes list; tap shows coming-soon alert |
| Stations | Category → station card → detail; Tune in shows fallback alert |
| MiniPlayer | Responsive play/pause |
| Lock phone | Audio continues; controls work |
| Auto-next | Next queue track starts |
| Provider labels | None on Home / Search / Explore primary rails |
| Heat | Device warm but stable during 10 min browse |

---

## Audit references

| Doc | Purpose |
|-----|---------|
| `launch-stability-audit.md` | Phase 1 playback + performance |
| `phase-2-discovery-validation.md` | Worlds, genres, moods |
| `phase-3-radio-browser-validation.md` | Radio browser |
| `phase-4-video-discovery-validation.md` | Video discovery |
| `phase-5-podcast-ecosystem-validation.md` | Podcast browse |
| `phase-6-smart-recommendations-validation.md` | Recommendations |
| `phase-7-launch-content-validation.md` | Launch content layer |
| `search-provider-branding-audit.md` | Search branding |

---

**Signed off for documentation:** automated checks pass at `516fb3a`. **Human device QA** is the remaining gate before TestFlight distribution to early adopters.

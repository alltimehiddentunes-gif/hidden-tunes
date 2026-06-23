# Podcast End-to-End Audit

**Branch:** `carplay-scene-safe-test`  
**Date:** 2026-06-22

## Root cause

**Primary Hidden Tunes podcast catalog API is not deployed.**

| Endpoint | Status | Result |
|----------|--------|--------|
| `GET https://admin.hiddentunes.com/api/podcasts/shows` | **404** | Next.js HTML error page |
| `GET https://admin.hiddentunes.com/api/podcasts/episodes` | **404** | Next.js HTML error page |
| `GET https://admin.hiddentunes.com/api/tv/videos` | **200** | Works (TV unrelated) |
| `GET https://hidden-tunes-api.onrender.com/api/podcasts/shows` | **404** | `Route not found` |

The mobile app was wired exclusively to the admin podcast routes. Every home lane, category, search, and show page returned **zero shows** → **zero episodes** → **nothing to play**.

**Fix:** Automatic fallback to **iTunes Search API** (shows) + **public RSS feeds** (episodes with HTTPS enclosures). Hidden Tunes catalog remains primary when backend is restored.

---

## Phase 1 — Source audit (runtime data)

### Primary source (broken)

**Home featured request:**
- URL: `https://admin.hiddentunes.com/api/podcasts/shows?collection=featured&page=1&limit=20`
- Status: **404**
- Total results: **0**

**Search "love":**
- URL: `https://admin.hiddentunes.com/api/podcasts/shows?q=love%20podcast&page=1&limit=20`
- Status: **404**
- Total results: **0**

**Search "ghana":**
- URL: `https://admin.hiddentunes.com/api/podcasts/shows?q=ghana%20podcast&page=1&limit=20`
- Status: **404**
- Total results: **0**

### Fallback source (working — now wired in app)

**iTunes search "love podcast":**
- URL: `https://itunes.apple.com/search?term=love+podcast&media=podcast&entity=podcast&limit=20`
- Status: **200**
- Total results: **20+**

**First 5 show titles:**
1. The Bad Girls Bible - Sex, Relationships, Dating, Love & Marriage Advice
2. Love Letters
3. Crazy Love Podcast
4. This is Love
5. Love Story: John F. Kennedy Jr. & Carolyn Bessette Official Podcast

**First 5 show IDs (app format):**
- `itunes-1203808663`
- `itunes-1354140820`
- (additional collection IDs from iTunes)

**First 5 artwork URLs:** Present (600×600 iTunes CDN URLs per result)

**Search "ghana podcast":**
- Status: **200**
- Count: **5**
- Titles: The Choral Music Ghana Podcast, Ghana Podcast, Suite Ghana Podcast, The Vet Podcast | Redefining Veterinary Medicine in Ghana, Health Podcast - Ghana

---

## Phase 2 — Show page audit

**Test show:** The Bad Girls Bible (iTunes collection `1203808663`)  
**App show ID:** `itunes-1203808663`  
**Feed URL:** `https://rss.libsyn.com/shows/93888/destinations/475312.xml`

**Episode request:** RSS fetch of feed URL (fallback when HT episodes API 404)

**Response status:** **200**

**Episode count parsed:** **10+** per feed (paginated 40/page in app)

**First 10 episode titles:**
1. #63 19 Orgasmic Blow Job Techniques to Make Your Man Explode with Samia Burton
2. #62 27 Hand Job Tips to Make Him Explode with Ashley Manta
3. #61 How To Control Your Gag Reflex, Swallowing & Deep Throating With Dr. Ianessa Humbert
4. #60 Domination Tips from A Real-Life Dominatrix, Mistress Eva Oh
5. #59 Ex-Porn Star Teaches How to Get & Stay Rock Hard…
6. #58 31 Powerful Blow Job Tips…
7. #57 How To Start Swinging…
8. #56 Understanding & Healing Anxious Attachment…
9. #55 How To Build A Rock Solid Marriage…
10. #54 Building Sexual Confidence and Enhancing Intimacy…

**Audio URLs present:** **YES** (10/10 HTTPS `traffic.libsyn.com/...`)

---

## Phase 3 — Playback audit

**Test episode:** #63 19 Orgasmic Blow Job Techniques…

| Check | Result |
|-------|--------|
| Audio URL present | **YES** (`https://traffic.libsyn.com/secure/badgirlsbible/...`) |
| `normalizePodcastEpisode` accepts URL | **YES** (HTTPS required) |
| `podcastEpisodeToAppSong` receives URL | **YES** → `audioUrl` / `streamUrl` |
| `routePodcastPlayback` → `playQueue` | **YES** (`queueMode: "podcast"`) |
| Player received URL | **YES** (code path; device QA pending) |
| Playback started | **Pending device QA** |

**Failing function (before fix):** `fetchPodcastShows` / `fetchPodcastEpisodes` in `podcastCatalogApi.ts` — HT API returned 404, no fallback, empty UI.

**After fix:** Fallback in `fetchPodcastShows` → `fetchItunesPodcastShows`; episodes via `fetchItunesPodcastEpisodes` (RSS).

---

## Phase 4 — Placeholders

| Item | Status |
|------|--------|
| Fake recently-played show cards | Already removed (prior commit) |
| Emotional world fake counts | Already removed |
| Empty rails | Hidden (`ShowRailSection` returns null) |
| Home lane fallback ladder | Uses real iTunes results when HT empty |
| Dummy "Hidden Tunes Podcast" cards | **None** in browse UI |

---

## Phase 5 — Fixes applied

| Fix | File |
|-----|------|
| HT API → iTunes/RSS fallback | `services/podcast/podcastItunesRssSource.ts` |
| Wired into catalog fetch | `services/podcastCatalogApi.ts` |
| `data.shows` / `data.episodes` payload support | `services/podcastCatalogApi.ts` |
| Dev runtime logs `[HTPodcastRuntime]` | `utils/podcastRuntimeDiagnostics.ts` |
| Show open + playback trace logs | `app/podcasts/show/[showId].tsx`, `services/playback/playbackRouter.ts` |

**Unchanged:** HiddenAudio, queue architecture, music/radio playback, mature expansion, CarPlay, Android Auto, Desktop.

---

## Dev diagnostics

Enable in `utils/podcastRuntimeDiagnostics.ts`:

```ts
export const ENABLE_PODCAST_RUNTIME_DIAGNOSTICS = true;
```

Events: `home_request`, `home_response`, `show_open`, `episode_request`, `episode_response`, `episode_audio_url`, `episode_play_tap`, `episode_play_success`, `episode_play_error`

---

## Manual QA checklist

| Test | Expected |
|------|----------|
| Podcast home | Real show cards with artwork |
| Tap show | Real episode list |
| Tap episode | Audio plays |
| Search "love" | Real shows → episodes → play |
| Search "ghana" | Real shows (if iTunes has them) → episodes → play |
| Mature OFF | Standard iTunes results (non-mature filter unchanged) |

---

## Remaining blockers

1. **Hidden Tunes backend** — Deploy `/api/podcasts/shows` and `/api/podcasts/episodes` on admin to replace iTunes fallback as primary.
2. **Device playback QA** — Confirm `playQueue` starts audio on physical device.
3. **Feed URL registry** — In-memory only; app restart loses feed URL until show re-fetched from iTunes (show list re-registers on load).

---

## Validation

```bash
npm run typecheck   # PASS
git diff --check    # PASS
```

## Build readiness

**NO** until device QA confirms episode playback for love/ghana/home flows.

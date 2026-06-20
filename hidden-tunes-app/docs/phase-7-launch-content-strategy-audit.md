# Phase 7 Launch Content Strategy Audit

**Scope:** Planning and audit only. No implementation in this queue. No playback, queue, Desktop, TV, CarPlay, or Android Auto changes. No UI redesign. No provider branding — everything surfaces as **Hidden Tunes**.

**Goal:** Ensure Hidden Tunes **never feels empty at launch** by auditing catalog volume, genre/mood coverage, search/radio/video/podcast readiness, and defining minimum vs ideal content targets plus an acquisition roadmap.

**Audit snapshot date:** Production APIs probed **2026-06-14** (`hidden-tunes-api.onrender.com`, `admin.hiddentunes.com`).

---

## Executive summary

| Pillar | Live volume | UX wired? | Feels full at launch? |
|--------|-------------|-----------|------------------------|
| **Music** | **~1,245** public songs, **58** artists, **69** albums | **Yes** — Home, Explore, Search, Library | **Mostly yes** — volume sufficient; genre depth uneven |
| **Radio** | Same catalog via `/radio` search | **Yes** — Listening Room | **Partial** — weak genres produce thin queues |
| **Videos (TV)** | **40** approved videos | **Yes** — TV tab + WebView | **Thin** — lanes fill, but catalog is small |
| **Podcasts** | **0** shows / episodes | **No** — not built | **No** — launch gap unless scoped out or seeded |
| **Genres** | **29** core UI genres; DB tags heterogeneous | **Yes** — hubs + spotlights | **Partial** — several launch genres near-zero |
| **Emotional Worlds** | **8** mood rooms + **10** chip shortcuts | **Partial** — chips not fully mounted | **Yes** if metadata matches mood matchers |
| **Recommendations** | Snapshot over **≤220** songs on device | **Yes** — Home/Explore rails | **Yes** for cold start (editorial rails) |

### Catalog coverage score (launch readiness)

| Domain | Score | Rationale |
|--------|-------|-----------|
| **Music catalog volume** | **82 / 100** | 1,245 playable rows — above minimum; metadata uneven |
| **Genre coverage (32 launch genres)** | **54 / 100** | ~17 strong, ~8 thin, ~7 empty playable depth |
| **Mood / emotional worlds** | **68 / 100** | Rooms wired; DB `mood` is free-text — matcher-dependent |
| **Search coverage** | **71 / 100** | Hidden Tunes API + waterfall; weak genres return empty |
| **Radio coverage** | **58 / 100** | Catalog radio works; empty genres = dead Listening Rooms |
| **Video coverage** | **48 / 100** | 40 videos; launch category taxonomy incomplete |
| **Podcast coverage** | **0 / 100** | No product surface or backend |
| **Cold-start (no history)** | **75 / 100** | Editorial discovery OK; Podcast tab missing |
| **Overall launch content** | **62 / 100** | **Music-first launch ready**; **four-pillar promise needs content + Podcast decision** |

**Strategic decision required before store submission:** Ship as **Music + Radio + Video (+ recommendations)**, with Podcasts **hidden or “coming soon”** — OR delay launch until podcast minimums are met (Phase 5 plan).

---

## 1. Current catalog sources

| Source | Endpoint / path | Used for | Branding in UI | Launch stance |
|--------|-------------------|----------|----------------|---------------|
| **Hidden Tunes catalog (primary)** | `GET https://hidden-tunes-api.onrender.com/api/songs` | Home, Explore, Search, Radio, Library | **Hidden Tunes** | **Primary** — Supabase `songs` + R2 audio |
| **Hidden Tunes artists** | `GET /api/artists` | Search grouped, Explore creators | Hidden Tunes | Secondary metadata |
| **Hidden Tunes albums** | `GET /api/albums` | Search grouped, Explore | Hidden Tunes | Secondary metadata |
| **Local persisted cache** | AsyncStorage catalog v5 | Offline / fast open | Hidden Tunes | Stale fallback only |
| **Audius** | Search waterfall step 2 | Search when HT results &lt; 4 | **Hidden Tunes** (rebranded) | Supplement only — not discovery rails |
| **Internet Archive** | Search waterfall step 3 | Search when still &lt; 4 | **Hidden Tunes** (rebranded) | Supplement only |
| **YouTube Data API (client)** | `searchYouTubeBackend` | Disabled | Would say YouTube | **Off** — do not enable for launch |
| **Hidden Tunes TV (admin)** | `GET https://admin.hiddentunes.com/api/tv/videos` | TV tab, Search TV chip | **Hidden Tunes TV** | Curated video catalog |
| **Podcast catalog** | — | — | — | **Does not exist** |

**Client visibility cap (important):** Home/Explore retain **≤240 songs** in screen state; discovery ranking uses **≤220** (`MAX_DISCOVERY_INPUT_SONGS`). Full **~1,245** catalog is available via API pagination and search — users can play beyond the snapshot, but **rails only “see” a slice** unless search/hub loads more.

---

## 2. Current song counts

| Metric | Value | Notes |
|--------|-------|-------|
| **Public songs (live API)** | **~1,245** | Paginated: 100/page × 12 full pages + 45 (page 13) |
| **API max page size observed** | 100 | Backend may cap above client `limit=24` default |
| **Songs in Home/Explore snapshot** | ≤240 / ≤220 | Performance caps — not full catalog |
| **Onboarding prewarm** | ≤30 songs | `onboardingPrewarm.ts` |
| **Search waterfall merge** | +Audius + Archive when sparse | Branded Hidden Tunes |

**Genre field sample (n=500 public songs):**

| Raw `genre` value | Count (sample) |
|-------------------|----------------|
| Pop | 90 |
| Instrumental | 89 |
| Traditional / Folk | 53 |
| Afro Soul | 49 |
| Soul Blues | 47 |
| Lo-fi | 43 |
| EDM | 41 |
| Blues | 36 |
| World | 24 |
| R&B / Soul | 18 |
| Country | 6 |
| Amapiano | 1 |
| Afrobeats | 1 |
| Jazz | 1 |

**Metadata note:** Raw DB genres **do not align** cleanly with `utils/genreAliases.ts` core titles. Normalization maps many aliases (e.g. “Lo-fi” → Lo-Fi, “rap” → Hip-Hop), but **under-tagged rows** weaken genre hubs and radio for Afrobeats, Jazz, Amapiano, Country.

**Mood field:** Sample shows **0 empty mood** — but values are often **long free-text** (comma-separated emotional phrases), not canonical mood room labels. Matchers partially work via keyword overlap; consistency is a content ops task.

---

## 3. Current artist counts

| Metric | Value |
|--------|-------|
| **Artists (live API)** | **58** |
| **With tracks attached** | 58 (API embeds tracks per artist page) |

**Launch assessment:** Sufficient for “Creators” rails if ≥3 tracks per featured artist. Risk: **long tail artists with 1 song** feel sparse in Artist Radio.

---

##  4. Current album counts

| Metric | Value |
|--------|-------|
| **Albums (live API)** | **69** |

**Launch assessment:** Adequate for album browse and Similar Albums planning (Phase 6). Many songs may still be **Singles** in UI if `album` unset.

---

## 5. Current genre coverage

### Core app genres (`utils/genreAliases.ts` — 29 visible cores)

Afrobeats, Hip-Hop, R&B, Soul, Gospel, Blues, Jazz, Reggae, Dancehall, Amapiano, House, EDM, Pop, Rock, Indie, Alternative, Country, Latin, Classical, Folk, Trap, Drill, Lo-Fi, Ambient, Instrumental, Acoustic, Funk, Disco, Soundtrack.

### Launch genre checklist (requested × live depth)

Depth key: **Strong** ≥15 playable search hits (API `q=` limit 20), **Thin** 1–14, **Empty** 0. Search scans title, artist, album, **genre, mood** — not identical to hub matching.

| Launch genre | Core mapping | Search depth (2026-06-14) | Hub / radio ready? |
|--------------|--------------|---------------------------|-------------------|
| Country | Country | **Strong** (20+) | Thin raw tags — search OK |
| Gospel | Gospel | **Strong** | **Ready** |
| Christian Worship | Gospel aliases (`worship`, `praise`) | **Strong** (`Worship` 20+) | **Ready** (label as Gospel/Worship) |
| Afrobeats | Afrobeats | **Strong** (17+) | Raw tag under-counted — search OK |
| Amapiano | Amapiano | **Thin** (2) | **Gap** — needs tagged uploads |
| Hip Hop | Hip-Hop | **Strong** | **Ready** |
| Rap | Hip-Hop alias | **Thin** (1) | Use Hip-Hop hub |
| R&B | R&B | **Thin** (2) | **Gap** — many “R&B / Soul” rows |
| Soul | Soul | **Strong** | **Ready** |
| Jazz | Jazz | **Strong** search; **1** raw tag | Matcher-dependent |
| Blues | Blues | **Strong** | **Ready** |
| Classical | Classical | **Empty** | **Critical gap** |
| Reggae | Reggae | **Empty** | **Critical gap** |
| Dancehall | Dancehall | **Empty** | **Critical gap** |
| Pop | Pop | **Strong** | **Ready** |
| Rock | Rock | **Thin** (1) | **Gap** |
| Metal | *(not a core genre)* | **Empty** | **Missing** — add core or hide |
| EDM | EDM | **Strong** | **Ready** |
| House | House | **Thin** (4) | Needs more rows |
| Techno | *(no core — near EDM)* | **Strong** search | Map to EDM/House editorial |
| Latin | Latin | **Empty** | **Critical gap** |
| French | *(not a core)* | **Strong** search* | Likely title/artist matches — not a French genre hub |
| African | *(partial via Afrobeats/World)* | **Empty** keyword | Use Afrobeats + World editorial |
| World Music | Folk / World rows | **Strong** (`World`) | **Ready** as World/Folk |
| Instrumental | Instrumental | **Strong** | **Ready** |
| Focus | Mood / Lo-Fi curated | **Strong** (`Focus`) | Mood room + Lo-Fi Focus section |
| Sleep | Mood hints | **Strong** (`Sleep`) | Calm / Sleep mood — not genre chip |
| Kids | *(not defined)* | **Empty** | **Missing** — hide or add Kids lane |

\*French search hits may include non-French-genre metadata noise — verify editorially before marketing a “French” hub.

### Missing genres (action list)

**Must tag or acquire before marketing these hubs:**

1. Classical  
2. Reggae  
3. Dancehall  
4. Latin  
5. Metal (decide: add core genre or exclude from launch marketing)  
6. Kids (decide: include or defer)  
7. Amapiano (thin — priority for brand identity)  
8. Rock (thin raw tags)

**Must normalize metadata (not necessarily new uploads):**

- Map `R&B / Soul`, `Soul Blues`, `Afro Soul`, `Traditional / Folk` → canonical cores  
- Split long `mood` strings into matcher-friendly tokens or admin `mood` enum

---

## 6. Current search coverage

### Architecture (unchanged — audit reference)

```text
Instant local rank (≤160–240 songs in memory)
  → runSearchWaterfall (Hidden Tunes API → Audius → Archive)
  → grouped artists / albums / genreMoods
TV chip → /tv (separate)
```

### Search probe results (API `q=` first page, limit 20)

| Query type | Result |
|------------|--------|
| Strong genres (Pop, Gospel, Blues, EDM, …) | 10–20 hits |
| Weak genres (Amapiano, Rap, R&B, Rock) | 1–4 hits |
| Empty genres (Classical, Reggae, Metal, Latin, Kids) | 0 hits |
| Mood-ish (`sleep music`, `christian worship`) | ~10 hits |
| Radio-style (`gospel radio`, `country`) | ~10 hits |

### Search coverage gaps

| Gap | Impact |
|-----|--------|
| Empty genre queries | User distrust — “Hidden Tunes has nothing for X” |
| Waterfall only when HT &lt; 4 playable | Long-tail queries may still feel empty on “Hidden only” filter |
| TV not in grouped song search | OK by design — but “Videos” not discoverable from main search list |
| No podcast search | Podcast pillar invisible |

**Launch rule:** Every **marketed genre chip** must return **≥8 playable Hidden Tunes rows** on `q=` — or **hide the chip** until content exists.

---

## 7. Current radio coverage

### Primary path: `app/radio.tsx` → `searchHiddenTunesSongs` → `playSong`

| Radio type | Params | Coverage |
|------------|--------|----------|
| Genre Radio | `genre`, `query` from `/genre` hub | **Good** for Pop, Gospel, Blues, EDM, Hip-Hop search terms |
| Mood Radio | `mood`, `query` | **Good** where mood strings match search |
| Artist Radio | `artist`, `query` | **OK** for 58 artists — quality varies |
| Search “mood radio” CTA | `query` from search box | **Good** default (`afrobeats`) |
| Faith / Country / Afrobeats launch radios (Phase 6) | Same `/radio` | Faith/Country/Afro **OK**; Reggae/Latin/Metal **empty** |

### Orphan path (do not rely on)

`radioEngine` + YouTube API — **disabled**, empty queues.

### Missing radio categories (content, not code)

| Launch radio (Phase 6) | Min songs for 30-min session | Status |
|--------------------------|--------------------------------|--------|
| Afrobeats Radio | 24+ unique | **OK** via search |
| Gospel / Faith Radio | 24+ | **OK** |
| Country Radio | 24+ | **OK** search; thin tags |
| Focus / Workout | 24+ | **OK** via mood + EDM/Instrumental |
| Relationship / Romantic | 24+ | **OK** via mood matchers |
| Reggae / Dancehall / Latin / Classical / Metal | 24+ | **Not launch-ready** |

---

## 8. Current video coverage

| Metric | Value |
|--------|-------|
| **Total approved TV videos** | **40** |
| **Featured lane (page 1)** | 12 |
| **Live Performances** (`format=Live Performances`) | **32** |
| **Documentaries** (`format=Documentaries`) | **8** |
| **Music Video** (singular admin infer) | **0** at exact filter |
| **Artist Interview / Podcasts format** | **0** |

**Lane probe (limit 12):**

| Lane query | Videos returned |
|------------|-----------------|
| Featured | 12 |
| Blues genre | 6 |
| Gospel genre | 5 |
| Jazz genre | *(not probed — likely thin)* |
| Afro Soul genre | *(admin tag dependent)* |

**Phase 4 launch categories (5) vs inventory:**

| Category | Status |
|----------|--------|
| Music Videos | **Missing** — 0 at canonical format |
| Live Performances | **Strong** — 32 |
| Artist Videos | **Partial** — scattered, no lane |
| Trending Videos | **No sort** — use Featured |
| Concert Videos | **Partial** — overlap Live Performances |

**Video verdict:** TV tab **does not look empty** (lanes fill), but **40 videos total** is below ideal for a flagship “Videos” pillar. Taxonomy singular/plural mismatch risks empty lanes if queries change.

---

## 9. Current podcast coverage

| Metric | Value |
|--------|-------|
| Mobile app podcast code | **0 files** |
| Backend podcast API | **None** |
| Public episodes | **0** |
| TV “Podcasts” video format | **0** videos (video ≠ audio podcast) |

**Verdict:** Podcasts are **0% launch-ready**. Target experience “Podcasts” **cannot ship** without Phase 5 backend + content seeding — or must be **removed from launch marketing** and tab bar plan.

### Missing podcast categories (all — Phase 5 tree)

All **58 planned podcast leaves** are missing content, including Tier 1 lanes: Featured, Hidden Tunes Originals, Business & Money, Culture, Faith, African Voices, Health, Comedy.

---

## 10. Missing moods (emotional worlds)

### Wired mood infrastructure

| Asset | Count |
|-------|-------|
| `PREMIUM_MOOD_ROOMS` | 8 (Late Night, Healing, Party Energy, Focus, Romantic, Heartbreak, Calm, Nostalgic) |
| `EMOTIONAL_DISCOVERY_SHORTCUTS` | 10 chips |
| Phase 6 emotional worlds | 10 named launch worlds |

### Launch world mapping

| Launch world | Status |
|--------------|--------|
| Night Drive | Partial — alias in Party Energy |
| Deep Focus | **Ready** — Focus room + Lo-Fi Focus curated |
| Heartbreak Recovery | **Ready** — Heartbreak room |
| Sunday Morning | **Gap** — needs composite matcher (Phase 2) |
| Afro Heat | **Ready** — Afrobeats curated section |
| Worship Sanctuary | **Ready** — Gospel + spiritual moods |
| Gym Energy | **Ready** — Party Energy room |
| Peaceful Piano | Partial — Calm + “Emotional Piano” MOOD_TAG |
| Late Night Vibes | **Ready** — Late Night room |
| Feel Good Friday | **Gap** — no curated id; use Party Energy editorial |

### Missing moods (canonical tagging)

Admin should add **`mood` enum or normalized tags** for: **Sunday Morning**, **Feel Good Friday**, **Worship Sanctuary** (beyond Gospel genre), **Sleep** (for Sleep hub), **Kids** (if launched).

**MOOD_TAGS (layer 3)** exist in `genreAliases.ts` but are **not exposed as chips** — 18 reserved tags usable for ingestion normalization.

---

## 11. Launch minimum content targets

Minimum = user never sees an **empty primary surface** (Home stage ≥3, Explore, Search with default query, TV home, Genre hub for marketed genres, one radio session ≥8 tracks).

### Music

| Asset | Minimum | Current | Pass? |
|-------|---------|---------|-------|
| Public playable songs | 800 | ~1,245 | **Yes** |
| Artists with ≥3 tracks | 15 | ~estimate 20+ | **Yes** |
| Albums | 40 | 69 | **Yes** |
| Core genres with ≥12 playable songs each | 12 genres | ~10 strong | **Borderline** |
| Songs with canonical genre + mood | 70% | ~100% genre; mood free-text | **Partial** |

### Radio

| Asset | Minimum | Current | Pass? |
|-------|---------|---------|-------|
| Launch radio templates with ≥24 tracks | 6 radios | ~4 solid, 2 weak | **Partial** |
| `/radio` fallback message when 0 | Copy exists | Wired | **Yes** |

### Videos (TV)

| Asset | Minimum | Current | Pass? |
|-------|---------|---------|-------|
| Total approved videos | 60 | 40 | **No** |
| Videos per home lane | 8 | 5–12 | **Borderline** |
| Launch category lanes (5) | 5 × 8 | 1.5 lanes effectively | **No** |

### Podcasts

| Asset | Minimum | Current | Pass? |
|-------|---------|---------|-------|
| Shows | 12 | 0 | **No** |
| Episodes | 96 (8 per show) | 0 | **No** |
| Tier 1 home lanes | 8 lanes populated | 0 | **No** |

### Recommendations (cold start)

| Asset | Minimum | Current | Pass? |
|-------|---------|---------|-------|
| Mood rooms with ≥6 songs | 6 rooms | 8 builders — content-dependent | **Yes** if snapshot includes matchers |
| Curated sections with ≥6 songs | 5 sections | 7 definitions | **Yes** |
| Recently Added rail | 8 songs | Wired | **Yes** |

---

## 12. Launch ideal content targets

Ideal = flagship quality for marketing screenshots and session length **45+ minutes** without repetition.

| Domain | Ideal target |
|--------|--------------|
| **Songs** | 2,500+ public; 200+ added/month post-launch |
| **Artists** | 120+; 40+ with ≥5 tracks |
| **Albums** | 150+ |
| **Genre depth** | All **24 marketed genres** with ≥40 songs each |
| **Mood normalization** | 80% songs with 1–3 canonical mood tokens |
| **TV videos** | 200+; 5 launch categories × 40 videos |
| **Podcasts** | 24 shows; 10+ episodes each; 8 home lanes |
| **Radio** | 10 smart radios × 50+ track pool each |
| **Hidden Tunes Exclusives** | 50+ exclusive songs + 10 original podcast/video series |

---

## 13. Launch content acquisition roadmap

**Phase A — Pre-launch blockers (weeks 1–4)**

1. **Metadata normalization pass** — map existing 1,245 rows to canonical genres/moods (no new UI).  
2. **Fill critical genre gaps** — Classical, Reggae, Dancehall, Latin, Amapiano, Rock, R&B (minimum 15 tracks each).  
3. **TV ingest sprint** — +20 videos; fix format taxonomy (`Music Video`, `Live Performances` plural).  
4. **Podcast decision** — ship without tab **OR** stand up admin + 12 shows × 8 episodes (Phase 5).  
5. **Hide empty hubs** — config-driven hide for Metal, Kids, Latin until counts ≥8.

**Phase B — Launch window (weeks 5–8)**

6. **Artist/expansion** — 30 new artists weighted to Afrobeats, Gospel, Country.  
7. **Album packaging** — group singles into albums for Explore.  
8. **Emotional worlds editorial** — Sunday Morning, Feel Good Friday playlists (admin curated lists).  
9. **TV launch five lanes** — content-first, then client lane config (Phase 4).  
10. **Exclusive branding** — “Hidden Tunes Originals” tag on selected uploads.

**Phase C — Post-launch retention (month 2+)**

11. **Podcast Tier 1 lanes** (if not day-one).  
12. **Weekly Featured / Trending** editorial (server `is_featured` or weekly list).  
13. **Regional charts** — Ghana, Naija, Global (static editorial, Phase 6).  
14. **Creator program** — submissions pipeline → approved catalog growth.

**Acquisition sources (server-side only — no provider branding in UI):**

| Source | Use |
|--------|-----|
| Hidden Tunes uploader / artist submissions | Primary exclusive growth |
| Admin bulk ingest | TV + podcast RSS (internal) |
| Licensed catalogs | Genre gap fills |
| **Do not** rely on Audius/Archive for rails | Search supplement only — inconsistent quality |

---

## 14. Search coverage analysis

| Surface | Empty risk | Mitigation |
|---------|------------|------------|
| Home search entry | Low | Trending mood chips + genre browse |
| Search default | Low | Recent searches + discovery |
| Genre chip tap | **High** for Classical, Latin, Reggae | Hide until minimum met |
| “Hidden only” filter | **High** on weak genres | Show friendly empty + adjacent genres |
| TV chip redirect | Low if TV ≥40 | TV search pagination |
| Podcast | N/A | Not shipped |

**Recommendation:** Maintain a **launch genre allowlist JSON** (admin + client shared) — only genres with `playableCount ≥ 8` appear in Explore grid and Emotional Worlds marketing.

---

## 15. Cold-start experience analysis

Target: user opens app → immediately sees Music, Radio, Videos, Podcasts, Genres, Emotional Worlds, Recommendations.

| Pillar | New user (no history) experience today | Empty? |
|--------|----------------------------------------|--------|
| **Music** | Hero + mood rooms + curated + recently added | **No** |
| **Radio** | Profile → Personal Radio; genre hub Listening Room; search CTA | **No** if default afrobeats/gospel |
| **Videos** | TV tab lanes hydrate from cache/API | **No** (thin but populated) |
| **Podcasts** | — | **Yes — missing product** |
| **Genres** | Explore genre worlds from snapshot | **Partial** — weak genres show thin grids |
| **Emotional Worlds** | Mood rooms rank from catalog | **Mostly no** |
| **Recommendations** | Editorial rails; Because You Listened empty until 1 play | **No** for first session |

**Dead ends to fix in content/config (not code in this queue):**

- Profile → **Recommended For You** placeholder  
- Genre hubs for **zero-match genres**  
- `/radio` with **0 catalog hits** (fallback copy only — still feels broken)  
- **Podcast tab** if added without episodes  

**Cold-start score:** **75/100** without Podcasts; **55/100** if store listing promises full four-media platform.

---

## 16. Biggest launch risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Podcast pillar promised but empty** | **Critical** | Defer tab/marketing OR seed Phase 5 minimums |
| **Genre hubs with 0–2 songs** | **High** | Allowlist + metadata pass |
| **TV catalog only 40 videos** | **High** | Ingest sprint; don’t over-market TV until 100+ |
| **Raw genre vs core genre mismatch** | **High** | Admin normalization — Afrobeats/Jazz under-tagged |
| **Free-text mood breaks matchers** | **Medium** | Canonical mood tokens |
| **Discovery snapshot 220 vs 1245 catalog** | **Medium** | Ensure diverse tags in **newest 300** uploads |
| **Search empty genres** | **High** | Hide + acquisition |
| **Provider leakage** | **Medium** | Keep waterfall branded; no YouTube in rails |
| **Radio YouTube fallback empty** | **Low** | Content-only — catalog radio must stand alone |
| **App Review “minimum functionality”** | **Medium** | No empty Podcast section; TV must play |

---

## 17. Safest launch positioning (content-only)

**Option 1 — Music-first (recommended minimum risk)**  
Ship: Music + Radio + Recommendations + TV (beta label)  
Defer: Podcasts tab and podcast marketing  
Hit: 1,245 songs, fix genre gaps, TV → 60+ videos  

**Option 2 — Full platform promise**  
Requires before submit: 60+ TV videos, 12 podcast shows, genre allowlist complete, no empty hubs  

---

## 18. Validation (this queue)

- [x] Audit only — no feature, UI, playback, or queue implementation  
- [x] Live catalog counts documented (~1,245 songs, 58 artists, 69 albums, 40 TV, 0 podcasts)  
- [x] Genre/mood/radio/video/podcast gaps mapped to launch checklist  
- [x] Minimum vs ideal targets + acquisition roadmap defined  
- [x] Cold-start and search coverage analyzed  

**Related audits:** [Phase 2 discovery](./phase-2-discovery-audit.md), [Phase 4 video discovery](./phase-4-video-discovery-audit.md), [Phase 5 podcast ecosystem](./phase-5-podcast-ecosystem-audit.md), [Phase 6 smart radio + recommendations](./phase-6-smart-radio-recommendations-audit.md), [Search flow](./search-flow-audit.md), [Memory + battery safety](./memory-battery-safety-audit.md).

**Counts methodology:** `GET /api/songs?limit=100&page=N` until partial page; `GET /api/artists?limit=500`; `GET /api/albums?limit=500`; `GET /api/tv/videos`; search probes `GET /api/songs?q=&limit=20`. Re-run before ship — catalog grows continuously.

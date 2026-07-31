# Sports Premium Grid + Live Sports TV — Report

**Date:** 2026-07-31  
**Workspace:** `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142`  
**Branch:** `fix/library-content-type-safe`  
**HEAD:** `e7fbfb01330e856df77a2079f15265a609dfb34e`  
**Metro:** port `8081` listening (Expo Metro)

---

## 1. Workspace proof

| Check | Result |
|---|---|
| `git rev-parse --show-toplevel` | `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| HEAD | `e7fbfb01330e856df77a2079f15265a609dfb34e` |
| Metro | `8081` LISTENING |
| Abort rule | Root matches SSD source of truth — proceeded |

No reset, stash, commit, push, deploy, or native build was performed for this task.

---

## 2. Ownership table (pre-edit audit)

| Area | Owner | Notes |
|---|---|---|
| Sports home | `app/sports/index.tsx` | Vertical FlatList of sections |
| Fixture card | `components/sports/SportsMatchCard.tsx` | variants `shelf` / `featured` / … |
| Results card | same `SportsMatchCard` (`finished`) | Score-first hierarchy |
| Sport hub | `app/sports/sport/[sportSlug].tsx` | Now 2-col auto grid |
| Country hub | `app/sports/country/[code].tsx` | Now 2-col auto grid |
| Sports search | `app/sports/search.tsx` | Fixtures + Live Sports TV |
| TV catalog | `services/tvCatalogApi.ts` | `GET /api/tv/videos` |
| TV search | `fetchTvCatalog({ q, category })` / `fetchTvSearchPage` | Bounded page/limit |
| TV play resolver | `services/tvDiscoveryOpen.ts` → `openTvDiscoveryStation` | Canonical handoff |
| TV player owner | `context/TvPlaybackContext.tsx` + `components/tv/TvPlayerHost.tsx` | Single expo-video / WebView owner |
| PiP owner | `components/tv/TvNativeVideoSurfaceImpl.tsx` | Existing TV PiP |
| Media session | `RemoteMediaControlsBridge` when owner=`tv` | Unchanged |
| TV taxonomy | `constants/tvBrowseCategories.ts` | Canonical category **`Sports`** |
| Feature flags | `constants/sportsFlags.ts` | Added `sports_tv_enabled` |

---

## 3. Current TV player ownership (reused)

Sports TV taps call:

1. `openTvDiscoveryStation(video, { queueVideos, discoveryContext })`
2. `fetchTvPlayback` / session attach via `getTvSessionController()`
3. Existing `TvPlayerHost` / `TvPlaybackProvider` (mounted in `app/_layout.tsx`)
4. Route `/tv-player` via existing navigation

**No** `SportsVideoPlayer`, second `expo-video` owner, Sports PiP, or Sports media-session was created.

---

## 4. Sports TV query / API

| Item | Value |
|---|---|
| Endpoint | `GET https://admin.hiddentunes.com/api/tv/videos` |
| Category | `category=Sports` (canonical browse taxonomy) |
| Pagination | `page` + `limit` (client default **24**, max **50**) |
| Platform | `platform=ios|android` |
| Playability | Server public catalogue + client `filterPublicTvCatalogVideos` / `isStationEligible` |
| Hook | `hooks/useSportsTvCatalog.ts` |
| Search | `fetchTvCatalog({ q, category: "Sports", page: 1, limit: 12 })` |

Sub-genres such as Football/Cricket are **not** separate TV browse categories in production taxonomy. Eligibility is the `Sports` category (plus playability gates). Sports product sport filters remain fixture-side only.

---

## 5. Sports TV totals (production catalogue audit)

Queried 2026-07-31 against `category=Sports&platform=android&limit=50`:

| Metric | Count |
|---|---|
| Backend `pagination.total` | **576** |
| Pages | 12 |
| Client playable gate (`public` ∧ `verified` ∧ `playable` ∧ `playback_status=playable` ∧ not quarantined ∧ reliability ≥ 60 ∧ android_playable) | **576** |
| With logo artwork | 281 |
| Quarantined in Sports category sample | 0 |

Home loads **one bounded page** (24) with explicit “Load more channels” pagination — never the full catalogue on phone.

---

## 6. Root Sports organization problems (before)

1. Fixture shelves defaulted to **1 column** with fixed **196px** card width → large empty gutter.
2. Empty Live Now reserved vertical space without a useful fallback.
3. No Live Sports TV surface on Sports.
4. Upcoming vs results shared similar hierarchy.
5. Sport hubs/country hubs also forced 1 column.

---

## 7. New section hierarchy

```text
Sports header
Sport filters — All | Football | Basketball | Cricket | More
(optional hero)
Live Now — verified live fixtures OR compact empty state
Live Sports TV — canonical TV Sports category (paginated)
Starting Soon — 2-col
Today’s Fixtures — schedule / 2-col
Upcoming Fixtures — 2-col
Recently Finished — 2-col (score-first)
Top / Popular Competitions
Browse Sports / Countries / Saved
```

`live_sports_tv` rank = **15** (immediately after `live_now` = 10).

---

## 8. Grid column behaviour

`lib/sports/ui/fixtureGridColumns.ts` + `SportsHorizontalShelf` `columns="auto"`:

| Available width | Columns |
|---|---|
| < 300 | 1 |
| Normal phone (~324–378 after padding) | **2** |
| ≥ 700 | 2–3 |
| ≥ 1000 | 3–4 |

Verification (`npx tsx scripts/verify-sports-premium-grid-and-live-tv.ts`):

```json
{
  "phoneColumns": [
    { "available": 324, "columns": 2 },
    { "available": 354, "columns": 2 },
    { "available": 378, "columns": 2 }
  ]
}
```

Fixture cards use `width: "100%"` of the grid cell (fixed 196px removed).

---

## 9. Card redesign

### Upcoming / shelf
- Status + bookmark
- Competition name
- Kickoff date/time
- Team names (2-line wrap)
- Countdown / Remind me (streams remain gated)

### Finished / results
- FINAL badge
- Competition
- Teams with aligned scores + winner emphasis
- Result date/time
- No reminder CTA / no empty action dominance

### Live Sports TV card
- Logo / initials, channel name, Sports · country, Live indicator when playable
- Whole-card tap → `openTvDiscoveryStation`

---

## 10. Feature flags

| Flag | Pilot (`.env` / `.env.local`) |
|---|---|
| `sports_enabled` | true |
| `sports_fixtures_enabled` | true |
| `sports_live_scores_enabled` | false |
| `sports_streams_enabled` | **false** (fixture broadcasts remain off) |
| `sports_tv_enabled` | **true** (new) |
| `sports_notifications_enabled` | false |

`sports_tv_enabled` is independent of `sports_streams_enabled` so canonical TV channels can surface without re-enabling quarantined fixture streams.

---

## 11. Files changed

### New
- `components/sports/SportsTvChannelCard.tsx`
- `components/sports/SportsTvShelf.tsx`
- `hooks/useSportsTvCatalog.ts`
- `lib/sports/sportsTvConstants.ts`
- `lib/sports/ui/fixtureGridColumns.ts`
- `scripts/verify-sports-premium-grid-and-live-tv.ts`
- `audit/sports-premium-grid-and-live-tv/SPORTS-PREMIUM-GRID-AND-LIVE-TV-REPORT.md`

### Updated
- `app/sports/index.tsx` — filters, Live Sports TV section, 2-col fixtures, compact no-live copy
- `app/sports/search.tsx` — Sports TV search group + TV playback handoff
- `app/sports/sport/[sportSlug].tsx` — auto columns
- `app/sports/country/[code].tsx` — auto columns
- `components/sports/SportsHorizontalShelf.tsx` — adaptive 1–4 columns
- `components/sports/SportsMatchCard.tsx` — full-width + upcoming/results hierarchy
- `components/sports/index.ts` — exports
- `constants/sportsFlags.ts` — `sports_tv_enabled`
- `types/sports.ts` — `live_sports_tv` rank/title
- `.env` / `.env.local` — `EXPO_PUBLIC_SPORTS_TV_ENABLED=true`

Unrelated podcast WIP on the branch was left untouched.

---

## 12. Playback handoff proof

`SportsTvShelf` / Sports search:

- Import `openTvDiscoveryStation` + `buildTvDiscoveryLaunchContext`
- `browseReturnPath: "/sports"` (home) or `/sports/search`
- `categorySlug/title: sports / Sports`
- Queue = loaded Sports TV page videos
- No local VideoView / WebView / Sports session controller

Route changes alone do not stop TV — existing TV session owner preserves playback across navigation.

---

## 13. TV feature parity

Inherited from existing TV stack (unchanged code paths):

| Feature | Result |
|---|---|
| play/pause | Via TvPlayerHost |
| buffering / retry / fallback | Existing TV resolve path |
| fullscreen / orientation | Existing |
| PiP | Existing native TV PiP |
| next/previous | Existing discovery queue |
| mute/volume | Existing |
| lock-screen metadata | Existing TV media session |
| media-switch exclusivity | Existing PlaybackHandoffCoordinator |

---

## 14. Search behaviour

- Fixture / team / competition / sport results unchanged (Sports API).
- Parallel bounded TV query: `category=Sports` + `q`.
- TV hits labelled **Live Sports TV**; tap uses TV owner.
- Fixture hits open fixture details — **no** claim that a channel is broadcasting that match.

---

## 15. Fixture-stream separation

| System | Status |
|---|---|
| Canonical Sports TV channels | Enabled via `sports_tv_enabled` |
| Event-linked fixture streams | Still gated by `sports_streams_enabled=false` |
| Quarantined IPTV fixture bridges | Still rejected in `lib/sports/publicEligibility.ts` |
| Auto-attach TV channel → fixture | **Not implemented** (forbidden) |

---

## 16. Performance findings

- One Sports TV catalogue query on Sports focus (page size 24).
- Pagination via “Load more” — no full 576 download on open.
- Deduped append by channel id; abortable fetches.
- Memoized TV cards; no per-card playability probes beyond catalogue gate.
- No nested vertical FlatLists for fixtures (still one home FlatList of sections).
- No player remount while scrolling Sports (player is global overlay).
- Live fixture polling remains gated by live-scores/streams flags (off in pilot).

---

## 17. Tests

```bash
npx tsx scripts/verify-sports-premium-grid-and-live-tv.ts
```

Result: `ok: true` (2-col phone math, no duplicate player files, TV handoff imports, streams remain false, env pilot flags).

---

## 18. Device verification

| # | Check | Status |
|---|---|---|
| 1–6 | 2-col grid + card hierarchy + compact no-live | Code + unit verify; needs Metro reload visual confirm |
| 7–9 | Live Sports TV below Live Now + pagination | Wired; needs device tap |
| 10–13 | Exact TV player / FS / PiP / next-prev | Handoff to existing owner — parity by construction |
| 14 | Navigate away keeps TV | Existing session owner |
| 15–16 | Search TV vs fixture separation | Implemented |
| 17–18 | No fixture Watch Live / quarantine holds | `sports_streams_enabled=false` |
| 19 | Music/Radio/Podcasts untouched | No edits to those systems in this task |

**Before/after screenshots:** not captured in this agent session (no device screenshot automation attached). Visual confirmation should be taken after Metro reload on a phone-width simulator/device.

---

## 19. Metro / build requirement

| Action | Required? |
|---|---|
| Metro reload / restart | **Yes** — `EXPO_PUBLIC_SPORTS_TV_ENABLED` is an Expo public env flag |
| New native binary / EAS build | **No** — JS/TS + env only; reuses existing TV native player |

Restart Metro on **8081** from this SSD root so the new env flag is picked up, then soft-reload the app.

---

## 20. Remaining limitations

1. TV taxonomy exposes a single **Sports** category — no Football/Basketball TV sub-lanes in backend browse names.
2. “Live” on a Sports TV card means the **channel stream is playable**, not that a specific fixture is on air.
3. Device UI screenshots / manual PiP/fullscreen confirmation still needed after Metro restart.
4. Hero may still appear above Live Now when a live/soon fixture exists (existing IA).
5. Prior podcast WIP on the branch remains unstaged/unrelated.

---

## 21. Confirmations

- No duplicate Sports TV player created.
- Fixture streams remain disabled.
- Quarantined fixture broadcasts remain quarantined.
- Unrelated systems (Music/Radio/Podcasts/Audiobooks) not changed by this Sports work.
- No reset, stash, commit, push, deploy, or build performed.

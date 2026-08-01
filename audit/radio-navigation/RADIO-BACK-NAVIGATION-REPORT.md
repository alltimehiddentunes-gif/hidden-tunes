# Radio Back Navigation Report

## 1. Workspace proof

| Check | Value |
| --- | --- |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| HEAD (at start) | `9944c315b58ada61ccaee4364defd626624f7f9d` |
| Metro 8081 | Not running at task start |

Abort conditions not triggered.

## 2. Current route hierarchy (proven)

Live Radio does **not** use `/radio/*` browse routes. `/radio` is the song **Listening Room**.

| Screen | Route | Notes |
| --- | --- | --- |
| Radio Home | `/stations` | Live Radio hub |
| Category results | `/stations/[categoryId]` | Genres, Countries, Languages, Moods/Emotional Worlds, Mature, Trending, etc. — **flat**, no intermediate hubs |
| Search | `/stations/search` | Query is in-screen state (+ optional `q` param) |
| Station details | *(none)* | Station tap starts playback; no dedicated station-details route |
| Station / full player | `/player` | Shared player; live-radio mode when queue is live stream |
| Listening rooms | `/radio` | Not Radio browse home |

### Ownership table (actual)

| Screen | Route | Previous back | Required parent (implemented) |
| --- | --- | --- | --- |
| Radio Home | `/stations` | `safeRouterBack("/radio")` | Exit opener via history, else `/library` |
| Category results (all) | `/stations/[categoryId]` | `safeRouterBack("/stations")` | **Replace** → `/stations` |
| Search | `/stations/search` | `router.back()` | **Replace** → `/stations` |
| Live-radio player | `/player` | `safeRouterBack("/music-feed")` | Origin category / search / `/stations` via queue `railId` / `searchQuery` |
| Mature results | `/stations/[categoryId]` | history back | **Replace** → `/stations` (no separate Mature hub route) |

**Hierarchy note:** The brief’s Genres→Reggae / Countries→Ghana intermediate hubs do not exist as routes. Browse tiles such as “Genres” / “Countries” open directly as category result pages (`browse-genre`, `browse-country`, …). Parents are therefore Radio Home, not invented hub routes.

## 3. Root cause

Radio child screens used **generic history back** (`safeRouterBack` / `router.back()`). That replays every intermediate category, search, and player push. Radio Home also fell back incorrectly to `/radio` (Listening Room).

## 4. Screens affected

- `app/stations/index.tsx`
- `app/stations/[categoryId].tsx`
- `app/stations/search.tsx`
- `app/player.tsx` (live-radio back branch only)

## 5. Parent-route map

```text
/stations/[categoryId]  →  /stations          (replace)
/stations/search        →  /stations          (replace)
/player (live radio)    →  /stations/search?q=… | /stations/[categoryId] | /stations
/stations               →  history exit | /library
```

Resolver: `utils/radioBackTargets.ts` → `resolveRadioBackTarget`.
Navigators: `utils/radioNavigation.ts` (`navigateRadioChildBack`, `navigateRadioHomeBack`, `navigateRadioPlayerBack`, `bindRadioHardwareBack`).

Station origin reuses existing live-radio queue context (`searchQuery`, `railId`) — no unbounded history store.

## 6. Files changed

| File | Change |
| --- | --- |
| `utils/radioBackTargets.ts` | **New** — pure parent resolver (Node-testable) |
| `utils/radioNavigation.ts` | **New** — replace navigators + Android hardware back binder |
| `app/stations/index.tsx` | Home back + hardware back |
| `app/stations/[categoryId].tsx` | Child replace back + hardware back |
| `app/stations/search.tsx` | Child replace back + hardware back |
| `app/player.tsx` | Live-radio back → `navigateRadioPlayerBack` |
| `scripts/test-radio-back-navigation.ts` | **New** — contract tests |
| `audit/radio-navigation/RADIO-BACK-NAVIGATION-REPORT.md` | This report |

## 7. Stack behavior before / after

**Before**

```text
Library → Stations → Category A → Category B → Search → Player → Player…
Back walks the full trail (and Home fallback could land on Listening Room).
```

**After**

```text
Library → Stations → Category | Search → Player
```

- Category / Search back **replaces** to Stations (one tap, no trail).
- Live-radio player back **replaces** to the originating category/search/home using queue context.
- Station switches stay on `/player` (playback owner unchanged); back does not step through prior stations.

## 8. Tests

| Suite | Result |
| --- | --- |
| `npx tsx scripts/test-radio-back-navigation.ts` | **passed** |
| Existing radio scripts (`performance`, `search-*`, `station-switch`, `uncapped-search`, `catalog-pagination`) | **passed** |
| ESLint on `radioBackTargets` / `radioNavigation` / stations home+category | **passed** |
| ESLint on `app/player.tsx` / `search.tsx` | Pre-existing react-hooks findings (not introduced by this change) |
| `tsc --noEmit` | Pre-existing errors in `app/more.tsx`, `utils/otaUpdateIdentity.ts` (unrelated) |

## 9. Device verification

Metro **8081 was not running** during this task. Device flows 1–10 were **not** exercised on hardware. Reload Metro 8081 and verify the listed flows before release.

## 10. Playback-continuity result

No changes to HiddenAudio, PlayerContext playback engine, Queue ownership, MiniPlayer, lock-screen, CarPlay, or Android Auto. Only the **player screen back handler** for live-radio mode was routed to the Radio parent resolver. Playback is not stopped by navigation back.

## 11. Metro / build requirement

- **Metro reload is sufficient** for testing this JS/TS navigation fix.
- **No new native / production build** required for this change.
- A production build is only needed when shipping the fix to TestFlight / App Store.

## 12. Remaining limitations

1. No Genres/Countries/Moods/Languages **hub** routes exist — category results return to Radio Home, not a non-existent intermediate hub.
2. iOS swipe-back still follows the native stack; after `replace` parents, the stack is shallow so swipe should match the logical parent, but swipe is not custom-intercepted.
3. Opening `/player` from MiniPlayer still uses the existing global push path (playback architecture untouched). Live-radio back now replaces to Radio origin instead of walking history.
4. Device verification pending Metro 8081.
5. A separate **Radio Ultra-Performance** brief was received in the same handoff and is **not** implemented in this report.

## Confirmations

- Playback architecture untouched (aside from player back routing for live radio).
- No unrelated tab / More / Music / Podcasts / TV / Sports navigation systems changed.
- No reset, stash, commit, push, deploy, migration, or build occurred.

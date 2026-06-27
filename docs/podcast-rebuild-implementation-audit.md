# Podcast Rebuild — Implementation Audit

**Branch:** `carplay-scene-safe-test`  
**Date:** 2026-06-22  
**Status:** Pre-implementation audit (required before new podcast code)

---

## Executive Summary

Podcasts were fully removed from the launch build. The rebuild must route every playable episode through the **existing** `PlayerContext` by converting `PodcastEpisode` → `AppSong` and calling `playSong` / `playQueue` with **`activeQueueMode: "standard"`**. No podcast queue mode, no separate player, no `source: "podcast"` on playback items.

---

## Current `AppSong` Shape

Defined in `context/PlayerContext.tsx`:

| Field | Role |
|-------|------|
| `id` | Required — sanitized by `makeSafeSongId` |
| `title` | Required for UI |
| `artist` / `user.name` / `channelTitle` | Display artist line |
| `streamUrl` / `url` / `audioUrl` / `audio_url` | **Playback URI** — first non-empty wins in `getPlayableUri` |
| `artworkUrl` / `coverUrl` / `thumbnail` / `artwork` | Artwork (via `getArtworkValue`) |
| `duration` | Seconds (or ms if > 10000, auto-normalized) |
| `source` | Routing hint — **must not be `"podcast"`** |
| `sourceName` | Display label |
| `type` | `"r2"` for HTTPS file streams, `"live_stream"` for radio |
| `genre` / `mood` | Optional metadata |
| `isOnline` | `true` when stream URL present |

### Required fields for playback

1. Valid `id`
2. At least one of: `streamUrl`, `url`, `audioUrl`, `audio_url` pointing to HTTPS audio
3. `type: "r2"` (recommended for file-based streams)
4. `source: "hidden-tunes"` (safest — avoids legacy podcast remapping path)
5. `isOnline: true`

`getPlayableUri` does **not** require `source` — only a non-empty URL string.

---

## Queue & Playback Modes

```ts
type ActiveQueueMode = "standard" | "youtube" | "radio" | "smart" | "live_stream";
```

- Radio uses `"live_stream"` via `routeRadioPlayback`
- Podcast episodes must use **`"standard"`** (default from `resolveQueueModeForSong`)
- **DO NOT** add `"podcast"` to `ActiveQueueMode`

### `PlaybackQueueContext`

Allowed `source` values: `album`, `artist`, `genre`, `mood`, `search`, `home_rail`, `queue`, `playlist`, `radio`, `recently_added`, `because_you_listened`, `smart_queue`, `full_catalog`, `android_auto`, `carplay`, `unknown`.

For podcasts use: `{ source: "unknown", label: "Podcasts" }` or `{ source: "search", label: showTitle, searchQuery }`.

`normalizePlaybackQueueContext` remaps legacy `context.source === "podcast"` → `"unknown"` — safe for persisted sessions.

---

## Legacy Podcast Code (must NOT return)

| Pattern | Current state | Rule |
|---------|---------------|------|
| `activeQueueMode: "podcast"` | Removed | Never re-add |
| `source: "podcast"` on AppSong | Remapped to `hidden-tunes` in `normalizeSong` | Avoid — use `hidden-tunes` directly |
| `type: "podcast"` | Remapped to `r2`/`local` | Avoid — use `r2` |
| `/api/podcasts` | Deleted | Use RSS only |
| `podcast_show` / `podcast_episode` favorites | Removed from union | Separate AsyncStorage store |
| Mature podcast hub (old) | Deleted | New `app/podcasts/mature.tsx` with separate gate |
| `playPodcastEpisode` dedicated player | Deleted | Use `playSong` |

---

## Safest Source Value for Podcast Playback

**`source: "hidden-tunes"`** with **`type: "r2"`**

Rationale:
- `normalizeSong` treats legacy `source === "podcast"` as migration-only
- `hidden-tunes` follows the standard file-stream path (same as catalog songs)
- `resolveQueueModeForSong` returns `"standard"` (not live_stream)
- Radio path requires `source === "radio"` — podcasts won't accidentally enter live_stream mode

Reference adapter: `services/playback/radioPlaybackAdapter.ts` (pattern only — podcasts are file streams, not live_stream).

---

## Recently Played

`services/recentlyPlayedEngine.ts` stores generic track metadata keyed by `id`.

**Decision: Option B** — separate `services/podcastRecentlyPlayed.ts` for podcast home "Recently Played Podcasts" rail. Optionally also call `addToRecentlyPlayed` with normalized AppSong if `id` is prefixed `podcast-` (won't break music UI since ids are distinct).

Do **not** reintroduce `showId` into `RecentlyPlayedTrack` unless needed.

---

## Radio Playback Path (reference)

1. `radioStationToAppSong` → `source: "radio"`, `type: "live_stream"`
2. `routeRadioPlayback` → `playSong(..., "live_stream")`
3. Mature gate via `useMatureContentGate` + `useMatureContentSettings`

Podcasts mirror steps 1–2 but with `standard` mode and **separate** `maturePodcastsEnabled` setting.

---

## Mature Radio Gate (unchanged)

- `utils/matureContentSettings.ts` — `MATURE_CONTENT_ENABLED_KEY`, `MATURE_CONTENT_CONSENT_KEY`
- `hooks/useMatureContentGate.ts` — consent modal for mature **radio**
- Profile toggle: "Show 18+ Content" → mature radio only

**Mature podcasts** get a **separate** setting: `maturePodcastsEnabled` in `utils/maturePodcastSettings.ts`. Must not alter mature radio keys or behavior.

---

## Search Integration

Current order in `app/search.tsx`:
1. Songs / artists / albums (catalog + backend)
2. TV videos
3. Radio (`useDeferredSearchMediaSections`)

Podcasts append **after radio** via `useDeferredSearchPodcastSections`. Mature podcast results filtered when `maturePodcastsEnabled` is false.

---

## Navigation

`components/navigation/navigationConfig.ts` — no podcast tab today.

**Entry points (safe):**
- Library tile → `/podcasts`
- Explore card in `EmotionalDiscoveryChips` → `/podcasts`
- Profile content preferences → Mature Podcasts 18+

Do **not** add main tab without layout review.

---

## Files to Change (planned)

| File | Purpose |
|------|---------|
| `types/podcast.ts` | New types |
| `constants/podcastCategories.ts` | Discovery tree |
| `data/podcastSeeds.ts` | Curated RSS seeds |
| `services/podcast/rssParser.ts` | RSS parsing |
| `services/podcast/podcastCache.ts` | TTL cache |
| `services/podcastService.ts` | Discovery API |
| `utils/podcastPlaybackAdapter.ts` | Episode → AppSong |
| `utils/maturePodcastSettings.ts` | Mature podcast gate |
| `utils/podcastDiagnostics.ts` | Dev logs |
| `services/podcastLibrary.ts` | Follow/save |
| `services/podcastRecentlyPlayed.ts` | Podcast recent history |
| `hooks/useMaturePodcastGate.ts` | Consent flow |
| `hooks/usePodcastHome.ts` | Home discovery |
| `hooks/useDeferredSearchPodcastSections.ts` | Search |
| `components/podcast/*` | UI cards |
| `app/podcasts/*.tsx` | Routes |
| `app/library.tsx` | Library tile |
| `components/EmotionalDiscoveryChips.tsx` | Explore card |
| `app/search.tsx` | Podcast search section |
| `app/profile.tsx` | Mature podcast preference |
| `hooks/usePlaybackRouter.ts` | `playPodcastEpisode` helper |

---

## Files That Must NOT Change

| File | Reason |
|------|--------|
| `context/PlayerContext.tsx` | Core playback — use adapter instead |
| `services/playback/playbackRouter.ts` | Radio-only — extend via adapter |
| `types/favorites.ts` | Song/artist/album/radio union |
| `services/favorites/unifiedFavorites.ts` | Core favorites |
| `utils/matureContentSettings.ts` | Mature **radio** settings |
| `src/hidden-audio/**` | HiddenAudio POC |
| CarPlay / Android Auto bridges | Out of scope |
| `hidden-tunes-desktop/**` | Desktop |

---

## Playback Tap Flow (target)

```
Episode tap
  → mature gate (if matureLevel !== safe)
  → validate audioUrl
  → podcastEpisodeToAppSong(episode)
  → playSong(song, queue, index, { source: "unknown", label: "Podcasts" }, "standard")
  → MiniPlayer appears
  → addPodcastRecentlyPlayed(episode)
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Black screen on empty category | Hide sections with zero shows/episodes |
| RSS parse crash | try/catch per feed, skip malformed items |
| Infinite fetch loop | TTL cache, single-flight requests, 8s timeout |
| Queue corruption | `standard` mode only, normalized AppSong |
| Mature autoplay | Gate before `playSong` |
| Bundle bloat | Small seed set; comment for backend ingestion |

---

## Approval

This audit satisfies Phase 1. Implementation may proceed.

# Phase 7 Launch Content Layer — Validation

**Date:** 2026-06-14  
**Scope:** Launch content polish only. Native playback, queue, lock-screen, background, CarPlay, Android Auto, Desktop unchanged.

---

## Automated validation

```bash
npm run lint          # 0 errors (pre-existing warnings)
npm run typecheck     # pass
npx expo config --type introspect --json  # pass
```

---

## Launch checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Featured Playlists appear | **Pass** — derived mixes + cloud playlists; tap opens `/cloud-playlist/[id]` |
| 2 | Featured Worlds appear | **Pass** — discovery worlds with emotional-world fallback chips |
| 3 | Featured Genres appear | **Pass** — genre hubs with core-genre fallback chips |
| 4 | Featured Radios appear | **Pass** — smart radio entries; hidden when empty |
| 5 | Featured Videos appear | **Pass** — launch video category chips → `/videos/[id]` |
| 6 | Featured Podcasts appear | **Pass** — launch podcast category chips → `/podcasts/[id]` |
| 7 | Trending Now appears | **Pass** — ranked + recently discovered pool |
| 8 | New Releases appears | **Pass** — recently discovered; deduped against Trending Now |
| 9 | Hidden Picks / Staff Picks appear | **Pass** — curated sections + recommendation backfill |
| 10 | Continue Exploring appears | **Pass** — Explore, Videos, Podcasts, Radio, Smart Radio, Search chips |

---

## Polish applied (this queue)

1. **Cloud playlist route** — added `app/cloud-playlist/[id].tsx` so Featured Playlists no longer dead-end.
2. **Launch playlist resolution** — `getHiddenTunesCloudPlaylistById` resolves launch-derived mix IDs.
3. **World/genre fallbacks** — core emotional worlds and core genres backfill empty chip rails.
4. **Duplicate worlds row** — hide legacy `EmotionalDiscoveryChips` when Featured Worlds is populated.
5. **Trending vs new releases** — new releases exclude songs already shown in Trending Now.
6. **Stale cache merge** — empty launch sections backfill from 12h AsyncStorage cache on cold start.
7. **Home cache re-render** — hydrate bump refreshes launch snapshot after storage read.

---

## Manual verify

Home opens fast → all 10 launch sections visible when catalog has songs → Search feels populated → Radio/Video/Podcast entry chips work → tap song → MiniPlayer → background → lock-screen → auto-next → smooth scroll → no provider labels → no fake playable songs.

---

## Remaining (deferred)

- Search Trending Now vs Continue The Thread overlap (same catalog pool; home dedupes across rows).
- Server-side launch bundle when catalog exceeds client ranking cap.

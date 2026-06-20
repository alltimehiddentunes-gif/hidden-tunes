# Phase 4 Video Discovery — Launch Notes

**Date:** 2026-06-14  
**Scope:** Mobile video discovery only. Native playback, queue, lock-screen, background, CarPlay, Android Auto, Desktop unchanged.

---

## Architecture

```text
Admin TV catalog (GET /api/tv/videos)
        │
        ▼
videoDiscoveryApi.ts + videoDiscoveryCache.ts (12h TTL)
        │
        ├── /videos — launch category grid (8 rooms)
        ├── /videos/[categoryId] — cached video list
        └── openHiddenTunesVideo → /youtube-player (WebView, isolated)
```

Song playback (`playSong`, `activeQueue`, `HiddenAudio`) is untouched. WebView player stops native audio on entry.

---

## Launch categories

1. Music Videos  
2. Live Performances  
3. Artist Videos  
4. Trending Videos  
5. Concert Videos  
6. Worship Videos  
7. Afrobeats Videos  
8. Country Sessions  

Each maps to admin catalog filters with a branded fallback query when primary results are sparse.

---

## Entry points

- Home / Explore / Search — `SubtleTvEntryLink` → `/videos` (Hidden Tunes Videos)
- Profile → Discovery → Hidden Tunes Videos
- Category empty state → `/tv` search (existing TV tab)

---

## Caching

- Per-category memory + AsyncStorage (`hidden_tunes_video_discovery_v1`)
- 12h TTL, in-flight dedup, debounced persist
- No fetch on app startup — prefetch on category tap only

---

## Manual verify

Home fast → Hidden Tunes Videos → categories → video cards → tap opens WebView → song tap-to-play / MiniPlayer / background / auto-next unchanged → no provider labels.

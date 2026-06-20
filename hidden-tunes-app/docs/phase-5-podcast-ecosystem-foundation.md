# Phase 5 Podcast Ecosystem — Launch Notes

**Date:** 2026-06-14  
**Scope:** Mobile podcast discovery only. Native music playback, queue, lock-screen, background, CarPlay, Android Auto, Desktop unchanged.

---

## Architecture

```text
Admin podcast catalog (GET /api/podcasts/shows, /api/podcasts/episodes)
        │
        ▼
podcastDiscoveryApi.ts + podcastDiscoveryCache.ts (12h TTL)
        │
        ├── /podcasts — category grid + search
        ├── /podcasts/[categoryId] — show list
        └── /podcasts/show/[showId] — episode list (playback deferred)
```

Song playback (`playSong`, `activeQueue`, `HiddenAudio` music path) is untouched. Episode tap shows a branded coming-soon alert — isolated podcast player is deferred.

---

## Launch categories (23)

Business, Technology, Finance, Education, News, Sports, Faith, Health, Motivation, Relationships, Dating, Marriage, Family, Breakup Recovery, Communication, Personal Development, Adult Conversations, Human Psychology, African Voices, African Business, African Culture, Artist Interviews, Behind The Music.

---

## Entry points

- Home / Explore / Search — `SubtlePodcastEntryLink` → `/podcasts`
- Profile → Discovery → Hidden Tunes Podcasts
- Search filter **Podcasts** → redirect `/podcasts?q=` (does not alter song waterfall)

---

## Caching

- Per-category shows + per-show episodes + search results
- 12h memory + AsyncStorage, in-flight dedup, debounced persist
- No fetch on app startup — prefetch on category/show open only

---

## Playback blocker (documented)

Backend podcast API and isolated `HiddenAudio` episode player are not wired in this phase. Discovery and episode listing ship first so music playback stays stable.

**Next step:** Deploy `/api/podcasts/*` on admin + build `/podcast-player` owner separate from `PlayerContext.playSong`.

---

## Manual verify

Home fast → Hidden Tunes Podcasts → categories → show cards → episode list → song tap-to-play / MiniPlayer / background / auto-next unchanged → no provider labels.

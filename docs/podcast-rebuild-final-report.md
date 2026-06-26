# Podcast Rebuild — Final Report

**Branch:** `carplay-scene-safe-test`  
**Date:** 2026-06-22  
**Commit message:** `Rebuild podcast discovery with mature gating and standard playback`

---

## Architecture Summary

Podcasts were rebuilt as a **clean RSS-based system** that does not restore legacy podcast architecture.

```
RSS Seeds (data/podcastSeeds.ts)
    ↓
podcastService.ts (fetch, parse, cache, search)
    ↓
UI routes (app/podcasts/*)
    ↓
podcastEpisodeToAppSong() → PlayerContext.playSong(..., "standard")
```

- **No** `activeQueueMode: "podcast"`
- **No** `source: "podcast"` on playback items
- **No** separate podcast player
- **No** changes to `PlayerContext.tsx`, unified favorites, or mature radio settings

---

## Playback Mapping

| Podcast field | AppSong field |
|---------------|---------------|
| `podcast-${episode.id}` | `id` |
| `episode.title` | `title` |
| `episode.showTitle` | `artist`, `channelTitle` |
| `episode.audioUrl` | `streamUrl`, `url`, `audioUrl` |
| `episode.artworkUrl` | `artworkUrl`, `coverUrl`, `thumbnail` |
| `episode.durationSeconds` | `duration` |
| `"Podcast"` | `genre` |
| `episode.emotionalWorld` | `mood` |
| `"hidden-tunes"` | `source` |
| `"r2"` | `type` |
| `true` | `isOnline` |

Queue context: `{ source: "unknown", label: "Podcasts" }`  
Queue mode: `"standard"`

---

## Mature Gate Behavior

Separate from mature **radio**:

| Setting | Storage key |
|---------|-------------|
| `maturePodcastsEnabled` | `@hidden_tunes_mature_podcasts_enabled_v1` |
| Consent timestamp | `@hidden_tunes_mature_podcasts_consent_v1` |

When disabled:
- Mature categories hidden on home and browse
- Mature seeds excluded from search
- Mature show/episode routes redirect to `/podcasts/mature`
- Playback blocked with consent modal on tap

Profile: **Content preferences → Mature Podcasts 18+**  
Mature radio toggle unchanged.

---

## Files Changed

### New
- `types/podcast.ts`
- `constants/podcastCategories.ts`
- `data/podcastSeeds.ts`
- `services/podcast/rssParser.ts`
- `services/podcast/podcastCache.ts`
- `services/podcastService.ts`
- `services/podcastLibrary.ts`
- `services/podcastRecentlyPlayed.ts`
- `utils/podcastPlaybackAdapter.ts`
- `utils/maturePodcastSettings.ts`
- `utils/podcastDiagnostics.ts`
- `hooks/usePodcastHome.ts`
- `hooks/useMaturePodcastGate.ts`
- `hooks/useDeferredSearchPodcastSections.ts`
- `components/podcast/PodcastCards.tsx`
- `components/podcast/MaturePodcastConsentModal.tsx`
- `app/podcasts/index.tsx` (replaced redirect)
- `app/podcasts/category/[id].tsx`
- `app/podcasts/show/[id].tsx`
- `app/podcasts/episode/[id].tsx`
- `app/podcasts/mature.tsx`
- `docs/podcast-rebuild-implementation-audit.md`
- `docs/podcast-rebuild-final-report.md`

### Modified
- `app/podcasts/[...slug].tsx` → redirect to `/podcasts`
- `app/library.tsx` → Podcasts tile
- `components/EmotionalDiscoveryChips.tsx` → Podcasts explore card
- `app/search.tsx` → Podcast search section (after radio)
- `app/profile.tsx` → Mature podcasts preference
- `hooks/usePlaybackRouter.ts` → `playPodcastEpisode`

### Not changed (per requirements)
- `context/PlayerContext.tsx`
- `services/favorites/*`
- `utils/matureContentSettings.ts`
- HiddenAudio, CarPlay, Android Auto, Desktop

---

## Discovery Tree

Implemented per spec: Featured, Trending, New Episodes, Popular, Recommended, Music, Emotional Worlds, Lifestyle, Global, Language, Mature 18+.

Empty categories are hidden (no seeds → no section).

---

## Validation Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS** |
| `git diff --check` | **PASS** |

Lint: pre-existing project noise unchanged; new podcast files follow existing patterns.

---

## Known Limitations

1. **Curated seed set only** (~12 feeds) — architecture supports more via backend/admin ingestion
2. **RSS home loading disabled** (`ENABLE_PODCAST_RSS_HOME_LOADING = false`) — home uses static seed metadata; episodes load when a show is opened
3. **Show-level RSS only** — max 10 episodes, 5s timeout per feed
4. **On-device RSS fetch** — subject to network; one feed at a time on show page
5. **Search** — seed title/category match only, no live episode search
6. **Follow/save** uses separate AsyncStorage, not unified favorites
7. **Recently played** uses separate podcast store
8. **Physical device QA** required after heat/loading fix

---

## Next Phase: Backend / Admin Ingestion

Large-scale podcast ingestion belongs in backend/admin pipeline, not the mobile bundle:

- Admin feed registration and categorization
- Pre-parsed episode index API
- CDN-cached artwork and audio metadata
- Mature classification at ingest time
- Search index for 10k+ shows

Mobile client should switch from `data/podcastSeeds.ts` to API endpoints when backend is ready. **Mobile must only browse lightweight metadata and load one show RSS at a time.**

---

## Performance Fix (2026-06-22)

See `docs/podcast-heat-loading-fix-report.md`. Home no longer fetches/parses RSS on mount. Pre-fix behavior caused device heat and infinite loading from parallel full-feed parses (TED ~2700 items).

---

## Manual Smoke Test Checklist

- [ ] Library → Podcasts opens home
- [ ] Explore → Podcasts card opens home
- [ ] Category pages load shows/episodes or empty state
- [ ] Tap episode → audio plays, MiniPlayer appears
- [ ] Mature section locked by default
- [ ] Profile toggle unlocks mature podcasts
- [ ] Search shows podcasts after radio
- [ ] Songs, radio, favorites, queue still work
- [ ] Mature radio unchanged

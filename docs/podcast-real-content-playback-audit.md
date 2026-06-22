# Podcast Real Content & Playback Audit

**Branch:** `carplay-scene-safe-test`  
**Date:** 2026-06-22

## Real content sources

| Layer | Source | Endpoint |
|-------|--------|----------|
| Shows | Hidden Tunes catalog API | `GET https://admin.hiddentunes.com/api/podcasts/shows` |
| Episodes | Hidden Tunes catalog API | `GET https://admin.hiddentunes.com/api/podcasts/episodes?show_id=` |
| Playback audio | Episode `audio_url` (HTTPS only) | Routed via `routePodcastPlayback` → `playQueue` (`queueMode: "podcast"`) |

HiddenAudio, queue architecture, music playback, and radio playback were **not modified**.

---

## Playable audio validation

**Rule:** Only episodes with `audio_url` starting with `https://` are discoverable and playable.

| Stage | Filter |
|-------|--------|
| Episode API results | `filterPlayablePodcastEpisodes` in `fetchEpisodesFromNetwork` |
| Episode lazy list hook | `filterPlayablePodcastEpisodes` after mature visibility |
| Playback normalizer | `normalizePodcastEpisode` returns `null` for non-HTTPS URLs |
| Playback router | `routePodcastPlayback` rejects empty `audioUrl` |
| Episode UI | Rows disabled/hidden when not playable; tap blocked |

---

## Show discoverability

Shows must pass `isDiscoverablePodcastShow`:

- Real title (no placeholder/demo/sample patterns)
- `episode_count > 0` **or** `last_published_at` present

Search and category results are ranked by playability signal (episode count, recency, artwork, quality score).

**Removed:** Fake recently-played fallback shows (`"Podcast Show"` with episode ID as show ID).

**Removed:** Aspirational `catalogTarget` show counts on emotional-world cards.

---

## Fallback discovery behavior

Home lanes (`featured`, `trending`, `popular`) use `loadPodcastHomeLaneWithFallback`:

If preferred lane is empty, tries in order:

`trending` → `popular` → `business` → `relationships` → `health` → `comedy` → `news` → `faith` → `african-voices`

Only sections with real shows render (`ShowRailSection` returns null when empty).

---

## Mature podcast behavior

| Mature OFF | Mature ON + consent |
|------------|---------------------|
| Mature shows/episodes filtered via `filterVisiblePodcastShows/Episodes` | Mature content included when API allows |
| No mature home sections | Mature category grid + 18+ badge |
| Consent gate on mature show deep links | Play after consent |

Only **playable** mature episodes appear in lists.

---

## Navigation & playback flow

```
Podcasts home → tap show card → /podcasts/show/[showId]
  → loadPodcastEpisodesPage (40/page, cache-first)
  → tap episode → normalizePodcastEpisode → playPodcastEpisode → routePodcastPlayback
```

Recently played now resolves real cached shows via `showId` (stored on podcast `AppSong`) — no synthetic show cards.

Favorites podcast episodes normalized before playback (fixes `audioUrl` vs `audio_url` mismatch).

---

## Performance rules preserved

- 40 items/page
- Cache-first lazy lists
- No startup bulk catalog fetch
- Request generation / stale cancellation in lazy hooks
- Home lane fallback is sequential (not parallel storm)

---

## Manual QA checklist

| Test | Expected | Result |
|------|----------|--------|
| Open Podcasts | Real show cards with artwork/title/publisher | **Pending device QA** |
| Tap show | Real episode list | **Pending device QA** |
| Tap episode | Audio plays | **Pending device QA** |
| Search "love" / "ghana" | Real shows, playable episodes | **Pending device QA** |
| Mature ON | Mature shows play after consent | **Pending device QA** |
| Dead episode | Hidden / not tappable | **PASS (code)** |
| Fake placeholders | Removed from recently played + emotional counts | **PASS (code)** |
| No black pages | Category empty redirects; home fallbacks | **Pending device QA** |

---

## Remaining blockers

1. **Backend data quality** — Some catalog shows may still lack HTTPS `audio_url` on episodes; client filters these out.
2. **Device QA required** — Confirm playback on physical device for love/ghana/mature searches.
3. **App Store submit** — `ascAppId` still required for non-interactive `eas submit`.

---

## Files changed

- `services/podcast/podcastDiscoverability.ts` (new)
- `services/podcast/podcastHomeLanes.ts`
- `services/podcast/recentlyPlayedPodcasts.ts`
- `services/podcastDiscoveryApi.ts`
- `services/podcasts/podcastNormalizer.ts`
- `hooks/useLazyPodcastEpisodeList.ts`
- `components/podcast/PodcastDiscoveryCards.tsx`
- `app/podcasts/index.tsx`
- `app/podcasts/show/[showId].tsx`
- `app/favorites.tsx`
- `types/podcast.ts`
- `services/playback/podcastPlaybackAdapter.ts`
- `services/recentlyPlayedEngine.ts`
- `context/PlayerContext.tsx` (optional `showId` on `AppSong` type only)

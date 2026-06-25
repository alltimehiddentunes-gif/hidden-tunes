# Podcast Real Data & Routing Audit

Date: 2026-06-22  
Branch: `carplay-scene-safe-test`

## Problem

- Podcast home showed cards that looked like fake placeholder shows (notably **"Hidden Tunes Podcasts"** as a show title/subtitle).
- Tapping some podcast cards did not open a real show page (category misroutes, invalid IDs, empty category bounce-back).

## Placeholders Found

| Location | Issue | Action |
|----------|-------|--------|
| `utils/openHiddenTunesPodcast.ts` | `podcastDiscoveryDisplayName` fell back to `HIDDEN_TUNES_PODCASTS_LABEL` | Removed brand fallback; returns sanitized title only |
| `utils/openHiddenTunesPodcast.ts` | `openHiddenTunesPodcastEpisode` "coming soon" alert | Removed (dead code; playback uses `playPodcastEpisode`) |
| `components/podcast/PodcastDiscoveryCards.tsx` | Category meta showed `Hidden Tunes Podcasts` | Changed to `Category` / show count |
| `components/podcast/PodcastDiscoveryCards.tsx` | Rail subtitle fallback `Hidden Tunes Podcast` | Removed; uses publisher/category only |
| `services/podcast/podcastNormalizer.ts` | Titles passed through brand fallback | Uses sanitized real title |
| `app/podcasts/[categoryId].tsx` | Empty non-mature category redirected to `/podcasts` (felt like same-page tap) | Replaced with in-place empty state |
| `app/podcasts/index.tsx` | `openShow` synthesized shows from any list item id | Guarded with `isValidPodcastShowId` |

## Fake Paths Removed

- No synthetic show cards without valid `itunes-{collectionId}` (or backend numeric/UUID) IDs.
- Category IDs (`featured`, `business`, `mature-dating`, etc.) cannot render as show cards or open `/podcasts/show/[showId]`.
- Discoverability filter rejects invalid IDs and brand-placeholder titles.

## Routes Fixed

| Card type | Route | Guard |
|-----------|-------|-------|
| Real show card | `/podcasts/show/[showId]` | `isValidPodcastShowId(showId)` + non-empty title |
| Category tile | `/podcasts/[categoryId]` | Category id only |
| Mature hub | `/podcasts/mature` | Hub category id |
| Invalid / category-as-show | Blocked | Show page shows unavailable state |

## Endpoint Testing

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET https://admin.hiddentunes.com/api/podcasts/shows` | **404** | Primary HT catalog unavailable |
| `GET https://admin.hiddentunes.com/api/podcasts/episodes` | **404** | Primary HT episodes unavailable |
| `GET https://itunes.apple.com/search?media=podcast` | **200** | Fallback show source |
| iTunes RSS feed per `feedUrl` | **200** | Episode audio via HTTPS enclosures |

Dev diagnostics (`[HTPodcastRuntime]`) log request URL, status, result count, first 20 titles/ids/artwork URLs for home, category, search, and show episodes.

## Real Show Titles (iTunes fallback sample)

Verified via iTunes search fallback when HT API returns empty:

- The Joe Rogan Experience
- Crime Junkie
- Dateline NBC
- SmartLess
- Huberman Lab

IDs format: `itunes-{collectionId}` (e.g. `itunes-1537788786`).

## Real Episode Titles (RSS fallback sample)

For `itunes-1537788786` (example feed):

- Episodes load from registered `feedUrl`
- Titles match RSS `<item><title>` values
- Audio URLs: HTTPS enclosure URLs present

## Audio URL Proof

- `isPlayablePodcastEpisode` requires `audio_url.startsWith("https://")`
- `filterPlayablePodcastEpisodes` applied before episode list render
- Show page calls `playPodcastEpisode(normalized, queue)` — no coming-soon handler
- Unplayable episodes render disabled with "Unavailable · no playable audio"

## Remaining Blocker

**Hidden Tunes podcast catalog API** (`/api/podcasts/shows`, `/api/podcasts/episodes`) returns **404**. Until backend is live, discovery relies on **iTunes Search + RSS** fallback. UI shows:

> Podcast discovery is temporarily unavailable.

…when no validated show rails load, while categories and search remain available.

## Safety Rules Applied

- No fake podcast rails
- No placeholder show names
- Category tiles labeled as categories, not shows
- Search only displays shows passing `isValidPodcastShowId` + discoverability filters

## Files Changed

- `utils/podcastShowId.ts` (new)
- `utils/openHiddenTunesPodcast.ts`
- `utils/podcastRuntimeDiagnostics.ts`
- `services/podcast/podcastDiscoverability.ts`
- `services/podcast/podcastNormalizer.ts`
- `services/podcasts/podcastNormalizer.ts`
- `services/podcastCatalogApi.ts`
- `services/podcastDiscoveryApi.ts`
- `services/favorites/favoriteItemBuilders.ts`
- `components/podcast/PodcastDiscoveryCards.tsx`
- `app/podcasts/index.tsx`
- `app/podcasts/[categoryId].tsx`
- `app/podcasts/show/[showId].tsx`
- `app/podcasts/mature/index.tsx`

## Manual QA Checklist

- [ ] Open Podcasts — no fake placeholder podcast cards
- [ ] Tap real podcast show — opens `/podcasts/show/itunes-*`
- [ ] Episodes load on show page
- [ ] Tap episode — audio plays
- [ ] Search `love` — real shows only
- [ ] Search `ghana` — real shows only
- [ ] Mature ON + consent — mature show opens and plays

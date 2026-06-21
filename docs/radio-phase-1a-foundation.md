# Radio Phase 1A — Featured Radio Foundation

Phase 1A builds the **live radio home foundation** without expanding browse categories beyond the spec. Mobile loads **40 stations per lane** (cache-first); catalog targets define backend scale.

## Home structure

| Section | Source | Home count | Catalog target |
|---------|--------|------------|----------------|
| Featured Stations | `topvote` + quality curation | 40 | 500 |
| Trending Now | `topclick` (plays/opens) | 40 | 500 |
| Most Popular | `topvote` + long-term votes | 40 | 500 |
| Recently Played | Local user history | user-specific | — |
| Recommended For You | Featured + trending + recent tags | 40 | derived |
| Emotional Worlds | 7 mood lanes | cards | 100–500 each |
| Browse | Countries, Languages, Genres, Talk, Sports, Faith, Adult 18+ | tiles | probed |

## Lane architecture

Each home lane has a **distinct API source** and **separate cache key**:

- `lane:featured` — Radio Browser `topvote`, filtered `quality_score >= 45`, sorted by quality
- `lane:trending` — Radio Browser `topclick`, sorted by `clickcount`
- `lane:popular` — Radio Browser `topvote`, filtered `quality_score >= 30`, sorted by `votes`
- `lane:recommended` — Client merge from featured/trending pools, boosted by recently played tags

Files:

- `constants/radioFoundation.ts` — page size, quality thresholds, catalog targets
- `constants/radioCategories.ts` — home lanes, browse tiles, legacy ID aliases
- `constants/radioEmotionalWorlds.ts` — 7 emotional worlds with sub-genres and targets
- `services/radio/radioQualityScore.ts` — client `quality_score` (0–100)
- `services/radio/radioBrowserApi.ts` — lane fetch + curation
- `services/radio/radioHomeLanes.ts` — recommended lane builder
- `hooks/useRadioHomeDiscovery.ts` — parallel lane load for home

## Quality system

Every station receives `quality_score` (0–100) at normalize time via `enrichStationWithQuality()`:

- Stream metadata (bitrate, codec, HTTPS)
- Branding (favicon, name)
- Popularity proxies (`votes`, `clickcount`)
- Reliability signals (tags, country, language)

Featured and Popular lanes apply minimum quality thresholds before surfacing.

## Emotional Worlds Radio

Always visible on home (7 cards):

1. Night Drive Radio — target 100+
2. Heartbreak Recovery Radio — target 100+
3. Sunday Worship Radio — target 200+
4. Deep Focus Radio — target 200+
5. Afro Heat Radio — target 300+
6. Hidden Treasures Radio — target 500+
7. World Mix Radio

Cards show catalog target as “live picks” meta; full lists paginate at 40/page in category browse.

## Browse (Phase 1A scope)

Seven browse tiles only. Legacy category IDs map via `resolveRadioCategoryId()`:

- `news-talk` → `talk`
- `gospel-worship` → `faith`
- `mature` → `adult`
- `african-radio` → `afro-heat`
- `world-radio` → `world-mix`

Empty browse categories are hidden after probe; emotional worlds are **not** gated by probe.

## Constraints preserved

- No changes to playback, HiddenAudio, CarPlay, Android Auto, or Desktop
- 40/page pagination, cache-first loading, no startup bulk fetch
- Mature content gating unchanged

## Phase 1B (next)

Mirror this structure for **Featured Podcasts** and **Emotional Podcasts**.

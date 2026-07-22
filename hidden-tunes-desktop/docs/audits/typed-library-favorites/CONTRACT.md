# Typed Library Contract

## Storage

- Key: `ht-desktop:library:v2`
- Migration flag: `ht-desktop:library:v2:migrated`
- Legacy sources (preserved): `ht-desktop:music-likes`, `ht-desktop:tv-favorites`, `ht-desktop:lectures-saved`

## Discriminator values

`song` · `radio` · `podcast_show` · `podcast_episode` · `audiobook` · `tv` · `motivational` · `lecture` · `sports` · `legacy_unknown`

Stored `type` is authoritative. Never infer from title, URL, ID length, artwork, or route.

## Family-safe identity

`{type}:{id}` — example `radio:123` and `song:123` are distinct.

Used for lookup, toggle, dedupe, React keys, migration, and removal.

## Required fields

`id`, `type`, `title`, `addedAt`

## Optional fields

`subtitle`, `artist`, `album`, `showTitle`, `showId`, `hostName`, `author`, `narrator`, `speaker`, `channelName`, `artwork`, `source`, `playId`, `category`, `country`, `duration`, `isMature`, `contentRating`, `metadata`, `legacyKey`

## Owner API

`items`, `isFavorite(type,id)`, `addFavorite(item)`, `removeFavorite(type,id)`, `toggleFavorite(item)`, `getItemsByType(type)`, `clearType(type)`, plus `countByType` / `migrationStatus`.

## Playback routing

| type | action |
| ---- | ------ |
| song | Music adapter / existing queue play |
| radio | Radio `/play` via radio adapter |
| podcast_show | Open show detail |
| podcast_episode | Episode `/play` |
| audiobook | Open book detail |
| tv | TV owner / video path |
| motivational | Open program detail |
| lecture | Open series detail |
| sports / legacy_unknown | Visible unsupported error |

## Mature rules

- Radio retains `isMature` / `contentRating`.
- General Library hides mature radio unless `ht-desktop:mature-library-access=1`.
- Sex Sound Radio stays `type=radio`, mature, not renamed, not deleted when gated.

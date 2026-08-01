# Phase 7 — Music data contract

## Sources

| Source | Role |
| --- | --- |
| `GET /api/songs`, `/api/albums`, `/api/artists` | Production catalogue |
| `CatalogProvider` / `catalogService` | In-memory pages + cache |
| `desktopCatalogBridge` | Electron IPC JSON when available |
| `musicProgressStorage` (`ht-desktop:music-history`) | Recently played (local) |
| `buildRecentlyAddedSongs` | Client sort by `createdAt` |
| Home builders in `mobileHomeParity.ts` | Affinity / rooms / albums worth |

No dedicated recommendations HTTP API. No charts API.

## Entities (real fields)

### Track (`ApiSong`)

id, title, artist, artistId?, album, albumId?, genre?, mood?, tags?, description?, artwork?, previewUrl?, audioUrl?, highQualityUrl?, audioVersions?, durationSeconds?, createdAt?, lyrics fields?

### Album (`ApiAlbum`)

id, title, artwork?, releaseYear?, createdAt?, artistId?, releaseType?

### Artist (`ApiArtist`)

id, name, artwork?, songCount?, tracks?

### Queue / playback item

`ApiSong` plus provider queue metadata (`QueueContext`, `QueueSeedMetadata`).

## Forbidden fabricated UI metadata

Do not invent: listener counts, chart ranks (“Top 100”), popularity scores, fake bios, trending claims, editorial descriptions without catalogue backing.
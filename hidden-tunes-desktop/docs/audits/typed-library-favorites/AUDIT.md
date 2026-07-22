# Typed Library Favorites — Audit

## Workspace

- Path: `C:\Users\Wills\Desktop\HiddenTunes-desktop-integration`
- Branch: `desktop/integrate-home-music-split`
- Start HEAD: `590d4b1`

## Before (defects)

| Media family | Favorite button | Stored shape | Playback path | Defect |
| ------------ | --------------- | ------------ | ------------- | ------ |
| Music | Player heart + Liked page | `ht-desktop:music-likes` `{songId,likedAt}` | Music audio adapter | Library page was catalog browse, not a user collection |
| Radio | None | None | `/api/radio/stations/{id}/play` | No typed save; risk of being confused with song if mis-liked |
| Podcast show | None | Progress/history only | Open show detail | No follow/favorite |
| Podcast episode | None | Progress/history only | `/api/podcasts/episodes/{id}/play` | No typed save |
| TV | Card + now-playing | `ht-desktop:tv-favorites` `{channelId,savedAt}` | TV video owner | Real favorites not shown in Library |
| Audiobook | None | Progress/history only | Audiobook chapter play | No save |
| Motivational | None (player heart mis-gated) | Progress/history only | Motivational play | `isMusicCatalogSong` used wrong `motivational:` prefix |
| Lecture | Series Save | `ht-desktop:lectures-saved` | Lecture play / open series | Saved series not in Library; sessions could be mis-liked |

## Additional defects

- Library sidebar destination mirrored the music catalog, not saved items.
- No family-safe identity (`song:123` vs `radio:123`).
- No versioned multi-family storage contract.
- Mature radio metadata had nowhere to live in a unified Library.

## Mobile reference (not copied)

Mobile keeps separate stores (`hidden_tunes_favorites`, TV favorites, podcast follows). Desktop uses one typed `ht-desktop:library:v2` union with family-safe identity while dual-writing legacy music/TV/lecture keys.

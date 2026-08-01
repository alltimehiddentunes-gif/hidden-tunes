# Data Source Matrix

| Section | Real? | Builder / source | Empty behaviour |
|---------|------:|------------------|-----------------|
| Hero | Yes | `buildHomeHeroCards` | Skeleton / hidden |
| Personal Mix | Yes | `buildPersonalMixes` | Catalogue Mix fallback |
| Quick access | Nav | Static destinations | Always shown |
| Recently Added | Yes | `buildRecentlyAddedSongs` | Truthful empty copy |
| Recently Played | Yes | `resolveRecentlyPlayedSongs` | Hidden if empty |
| Because You Listened | Yes | history + catalogue | Hidden if empty |
| Smart Queue | Yes | active queue | Hidden if empty |
| Albums Worth | Yes | playable albums | Hidden if empty |
| Creators | Yes | playable artists | Hidden if empty |
| Mood Rooms | Yes | matched catalogue terms | Hidden if empty |
| Emotional Worlds | Yes | emotional lanes ≥3 tracks | Hidden if empty |
| Genre Spotlights | Yes | registry + genre intent | Hidden if no songs |
| Explore Family | Nav | editorial category art | Always when section shown |
| Open Rooms | Yes | matched groups | Hidden if empty |
| All Songs | Yes | catalogue window | Empty + Retry |

No fabricated Top Charts.

# Home Mobile ↔ Desktop Parity Map

| # | Mobile | Desktop equivalent | Adaptation |
|---|--------|-------------------|------------|
| 1 | Search launcher | Centre search via existing `HomeTopBar` + Home search affordance | No duplicate top route strip |
| 2 | Hero carousel | Bounded hero carousel (max height, not 100vh) | Wider crop; same pills/order |
| 3 | Signal pills | Same labels | Desktop spacing |
| 4 | Listening brief | Same copy; driven by `DesktopPlaybackProvider` | Opens player / focuses search |
| 5 | Radio / Podcasts / Audiobooks / More | Same four cards | More → desktop Discover Worlds (`worlds`) until a More hub exists |
| 6 | Emotional Worlds chips | Same chip titles | Navigate to Worlds / mood |
| 7 | Mood Rooms | Same titles + keyword match | Grid with more columns |
| 8 | Recently Added | Same title | Grid / rail |
| 9 | Because You Listened | Same title + artist-signal logic | Rail |
| 10 | Smart Music Queue | Same title; active queue else catalog slice | Horizontal rail |
| 11 | Creators In Your Orbit | Same title | Artist cards |
| 12 | Albums Worth Staying With | Same title | Album cards |
| 13 | Open Rooms | Same titles | Grid |
| 14 | Genre Spotlights / Made for you | Same titles | Rail + See all → Worlds |
| 15 | All Songs + Load More | Same | Windowed list |

## Explicitly removed from desktop Home

- Continue Listening section
- Recommended for You
- Hidden Gems section
- More to Explore (TV/Sports/Motivationals/Lectures chips)

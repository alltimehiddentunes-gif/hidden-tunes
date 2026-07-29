# Routes Matrix (Launch Readiness)

Routing: `NavKey` in `App.tsx` (no React Router).

| Route | Owner | Status | % | Launch ready? | Main blocker |
|-------|-------|--------|---|----------------|--------------|
| Home | MusicHomePage | Mostly ready / visual near | 80 | Near | Dirty assets; polish vs reference |
| Music | MusicWorkspace… | Functionally working but visually incomplete | 55 | **No** | Requires redesign |
| Genre destinations | DiscoverPage + genre intent | Mostly ready | 78 | Conditional | Via search intent; dirty registry |
| Artists | ArtistsPage | Mostly ready | 80 | Conditional | — |
| Albums | AlbumsPage | Mostly ready | 80 | Conditional | — |
| Radio | RadioPage | Mostly ready | 82 | Conditional | Decorative LIVE |
| Podcasts | PodcastsPage | Mostly ready | 80 | Conditional | — |
| TV | TvPage + panel | Mostly ready | 85 | Conditional | Stream QA |
| Sports | DesktopSportsPage | Fixture-only / structurally incomplete | 45 | **No** | Invisible video surface |
| Audiobooks | AudiobooksPage | Mostly ready | 72 | Conditional | — |
| Motivationals | MotivationalsPage | Partially complete | 62 | **No** | Video surface risk |
| Lectures | LecturesPage | Mostly ready | 70 | Conditional | Empty prod possible |
| Search | DiscoverPage | Mostly ready | 85 | Conditional | — |
| Library | DesktopLibraryPage | Mostly ready | 78 | Conditional | Sports favs |
| Favorites | LikedPage | Partially complete | 65 | **No** | Music-only IA |
| Playlists | DesktopPlaylistsPage | Mostly ready | 70 | Conditional | Local-only |
| Downloads | DesktopDownloadsPage | Mostly ready / partial | 75 | Conditional | Music stub; resume weak |
| History | DesktopHistoryPage | Mostly ready | 72 | Conditional | — |
| Settings | SettingsPage | Partially complete | 55 | **No** | Dead controls |
| Premium | PremiumPage | Placeholder | 40 | **No** | Checkout disabled |
| Profile | — | Not implemented | 15 | **No** | No route |

No route is fully “Launch ready” while dirty tree + packaging remain unresolved.

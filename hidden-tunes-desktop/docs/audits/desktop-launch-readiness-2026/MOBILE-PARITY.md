# Mobile ↔ Desktop Parity Roadmap (Master)

**Mobile SSD:** `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` @ `9944c315…` (`fix/library-content-type-safe`)  
**Desktop SSD:** `D:\HiddenTunes\Active\HiddenTunes-Desktop` @ `3b4a91fc…` (`desktop/integrate-home-music-split`)

Mobile is treated as **feature-complete** except Sports streams (intentionally off) and known CarPlay engineering issues.

Priority: P0 launch blocker · P1 major · P2 minor · P3 cosmetic/optional  
Effort: S / M / L / XL

---

## Parity table

| Feature | Mobile | Desktop | Gap | Priority | Effort |
|---------|--------|---------|-----|----------|--------|
| Home / music feed | Bottom Home `/music-feed` | Home + separate Music page | Dual surface OK; polish + honesty | P1 | M |
| Explore / Worlds | `/worlds` | `worlds` / mood page | Close | P2 | S |
| Genre rooms | `/genre` | Genre tiles + filtered load | Dedicated room depth | P2 | M |
| Mood rooms | Explore + utils | Mood detail | Close | P2 | S |
| Search | `/search` universal | Discover + global search | Close | P2 | S |
| Library | `/library` hub | `DesktopLibraryPage` | Close; sports favorites gap | P2 | S |
| Favorites / Liked | `/favorites` | liked / library | Close | P2 | S |
| Downloads | `/downloads` | Full Electron downloads | Music stub dishonest | P0 | S |
| Playlists | `/playlists` + detail | Desktop playlists | Close | P1 | M |
| Queue page | `/queue` | Panel only | Optional dedicated page | P2 | M |
| Radio live | `/stations` | Radio page | Close | P1 | S |
| Personal radio | `/radio` | Partial / different IA | Product decision | P2 | M |
| Podcasts | Full nest | Pages + show | Close | P1 | S |
| Audiobooks | Full | Pages + book | Close | P1 | S |
| Motivationals | `/motivation` | Pages + program | Close | P1 | M |
| Lectures | `/lectures` | Pages + series | Visual polish | P1 | M |
| TV | `/youtube-feed` + host | TvPage + shared video | Art placeholders | P1 | M |
| Sports browse | `/sports` preview | DesktopSportsPage | Empty/API gated | P1 | M |
| Sports streams | **Off** (`sports_streams_enabled:false`) | Will play if API playable | Align honesty kill-switch | P0 | S–M |
| More hub | `/more` | Missing (sidebar instead) | IA difference | P2 | M |
| Auth | `/auth` | **No UI** | Major product gap | P0* | XL |
| Profile / settings | `/profile` rich | Settings partial | Depth gap | P1 | M |
| Premium / membership | UI chrome, not paywall | Honest coming-soon | OK if preview; else XL | P1* | XL* |
| Playback owner | `PlayerContext` | `DesktopPlaybackProvider` | Architecture OK | — | — |
| Mini / full player | MiniPlayer + `/player` | Persistent + fullscreen | Desktop-appropriate | P2 | S |
| Background audio | Native HiddenAudio | Window session | Tray/background policy | P2 | M |
| Continue listening | Multiple surfaces | Multiple surfaces | Close | P2 | S |
| Recently played | `/recently-played` | History page | Close | P2 | S |
| Recommendations | Home rails | Smart continuation only | Product rails | P2 | L |
| Artist / album | Dedicated routes | Detail views | Follow needs auth | P0* / P1 | blocked |
| Creator upload | Mobile admin/uploader | Absent | Desktop N/A unless required | P3 | XL |
| CarPlay | Native / incomplete edges | N/A desktop | — | — | — |
| Keyboard shortcuts | Limited mobile | Partial desktop | Document + expand | P2 | S |
| Offline | Downloads | Downloads + catalog cache | Global UX | P1 | M |
| Auto-update | App Store / Play | **None** | Desktop ops gap | P0 | L |
| Installer / versioning | Store versions | `0.0.1` NSIS unsigned | Release engineering | P0 | M |

\*Auth/Premium: treat as **P0 only if product requires account or paid membership for desktop launch**. Mobile ships with auth UI; desktop does not. If desktop launch is “local catalogue preview,” Auth/Premium checkout can be P1 with honest labeling — still not 100% mobile parity.

---

## Parity completion estimate

| Band | % |
|------|---|
| Core listen/browse families | ~85% |
| Account / membership / sync | ~15% |
| Sports (honest browse-only) | ~60% UI / ~0% streams (intentional) |
| Desktop ops (update/sign) | ~25% |
| **Weighted overall parity** | **~68%** |

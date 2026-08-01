# Functional Audit

**Scope:** Current source under `hidden-tunes-desktop/` (dirty WIP included as current behaviour)  
**Reference:** Mobile app at `HiddenTunes-CLEAN-1.0.142`  
**Classifications:** PASS | PARTIAL | BROKEN | NOT IMPLEMENTED | BLOCKED

Difficulty: S (&lt;0.5d) · M (0.5–2d) · L (3–7d) · XL (&gt;1w)  
Risk: Low · Medium · High

---

## Feature matrix

| Feature | Status | Current behaviour | Expected (vs mobile / launch) | Root cause | Files | Diff | ETA | Risk |
|---------|--------|-------------------|-------------------------------|------------|-------|------|-----|------|
| Home | PARTIAL | Music-centric home with hero, rails, continue listening, recently added from real catalogue | Premium home matching mobile music-feed quality; no dishonest cards | Album filler padding still possible; dual nav; polish WIP | `MusicHomePage.tsx`, `App.tsx`, `mobileHomeParity.ts` | M | 2–4d | Med |
| Music | PARTIAL | Full Music page + section subnav; catalog windowed | Complete Music hub without dishonest stubs | Downloads subnav stub says offline unavailable | `MusicSectionContent.tsx`, music components | S | 0.5d | Low |
| Search | PASS | Global desktop search → Discover; family queries | Universal search like mobile `/search` | — | `useGlobalDesktopSearch.ts`, Discover in `App.tsx` | — | — | — |
| Library | PASS | Typed library / favorites hub | Library hub with collection entry points | Sports favorites explicitly unavailable | `DesktopLibraryPage.tsx`, `dispatchLibraryItem.ts` | S | 0.5d | Low |
| Queue | PARTIAL | Queue owned by playback provider; UI is player panel only | Mobile has dedicated `/queue`; desktop panel may be enough if intentional | No `NavKey` queue; `onOpenQueuePage` unwired | `DesktopPlaybackProvider.tsx`, `PlayerShellPanels.tsx` | S–M | 1d | Low |
| Playlists | PASS | User playlists page + playback dispatch | Create/play playlists | — | `DesktopPlaylistsPage.tsx`, `dispatchPlaylistPlayback.ts` | — | — | — |
| Downloads | PASS | Electron DownloadManager + page + `ht-download:` playback | Offline eligible families | Music stub contradicts real feature | downloads bridge + `DesktopDownloadsPage.tsx` | S | 0.5d | Low |
| Radio | PASS | Stations page + audio adapter | Live radio browsing/play | — | `RadioPage.tsx`, `radioPlaybackAdapter.ts` | — | — | — |
| TV | PASS | Catalog browse, HLS video path, route-independent surface | Persistent TV like mobile host | Artwork placeholders on some channels | `TvPage.tsx`, `HtmlVideoPlaybackService.ts`, `TvVideoSurface.tsx` | M | 1–2d | Med |
| Podcasts | PASS | Shows/episodes + continue listening | Podcast browse + show pages | — | `PodcastsPage.tsx`, `PodcastShowPage.tsx` | — | — | — |
| Audiobooks | PASS | Books + chapters | Audiobook browse/detail | — | `AudiobooksPage.tsx`, `AudiobookBookPage.tsx` | — | — | — |
| Motivationals | PASS | Programs; audio + video path | Motivational browse/program | Layout verify script exists | `MotivationalsPage.tsx`, adapters | M | 1d | Med |
| Lectures | PARTIAL | Series browse; audio/video mount | Clean lecture cards + playback | Prior capture showed title/badge overlap; verify needed on current CSS | `LecturesPage.tsx`, `LectureSeriesPage.tsx` | M | 1–2d | Med |
| Sports | PARTIAL / BLOCKED | Browse UI; play only if API marks playable + HTTPS stream resolves | Mobile: fixtures UI with streams intentionally off | No desktop `sports_streams_enabled` kill-switch; public API often empty/`enabled:false` | `DesktopSportsPage.tsx`, `resolvePlayableStream.ts` | L | 3–7d* | High |
| More | NOT IMPLEMENTED | No More hub page | Mobile `/more` discovery hub | Desktop uses sidebar groups instead | — | M | 1–2d | Low |
| Settings | PARTIAL | About, quality, reset/cache; Appearance/Playback nav disabled | Profile/settings depth closer to mobile profile | Incomplete settings sections | `SettingsPage` in `App.tsx` | M | 2d | Med |
| Authentication | NOT IMPLEMENTED (product) | Cosmetic “Hidden Listener”; Supabase session helper for Artist Follow only | Mobile `/auth` login/signup | No login/signup UI | `services/desktopSupabaseAuth.ts`, sidebar in `App.tsx` | XL | 1–2w | High |
| Premium | PARTIAL | Honest “Membership preview”; `checkoutAvailable: false` | If launch requires billing: real checkout; else honest preview OK | No entitlement authority / billing | `premiumPresentation.ts`, Premium page | XL* | 1–2w* | High |
| Playback | PASS | Single `DesktopPlaybackProvider`; audio/video mutex | One owner; no route kills media | — | provider + services | — | — | — |
| Background behaviour | PARTIAL | Continues while window open; Windows quit on last window | Desktop OS background expectations | No tray/minimize-to-tray verified as product | `electron/main.js` | M | 1–2d | Med |
| Media switching | PASS | Explicit play switches session; route changes do not stop | Route-independent media | Verified by `verify:route-media` | `resolveActivePlayerSurface.ts` | — | — | — |
| Continue Listening | PASS | Present across home + family pages | Resume progress | — | family progress stores | — | — | — |
| Recently Played | PASS | History page + filters | Dedicated recent surface | — | `DesktopHistoryPage.tsx` | — | — | — |
| Recommendations | PARTIAL | Smart continuation / related queues; no dedicated recs product | Mobile rails (“Because You Listened”) | No dedicated Recommendations API surface | `smartContinuation.ts` | L | 3–5d | Med |
| Emotional Worlds | PASS | Worlds / mood page | Explore worlds | — | EmotionalWorldsPage in `App.tsx` | — | — | — |
| Genre Rooms | PARTIAL | Genre tiles + filtered genre loading | Mobile `/genre` room | Scan limit 25 pages; empty risk | `loadFilteredGenrePage`, `musicGenres.ts` | M | 1–2d | Med |
| Mood Rooms | PASS | Mood detail + worlds cards | Mood room play | — | MoodDetailView | — | — | — |
| Creator pages | PARTIAL | Artist detail acts as creator surface | Dedicated creator product if mobile upload flows required | No uploader dashboard on desktop | `ArtistDetailView` | L | optional | Low |
| Album pages | PASS | Album detail + albums list | Album browse/play | — | AlbumDetailView | — | — | — |
| Artist pages | PARTIAL | Artist detail; Follow needs session with no sign-in path | Follow usable after auth | Auth gap | ArtistDetailView + auth helper | blocked by auth | — | High |
| Player (mini/full/persistent) | PASS | Persistent rail, footer bar, fullscreen cinema shells | Always-available transport | — | `DesktopPersistentPlayer.tsx`, `PremiumFullscreenShell.tsx` | — | — | — |
| Keyboard shortcuts | PARTIAL | Space, arrows, media keys, Escape | Documented shortcut map | Incomplete map / no settings list | provider ~3044+ | S | 0.5d | Low |
| Window behaviour | PASS | 1680×1024 default; min 1280×800; ready-to-show | Stable window | — | `electron/main.js` | — | — | — |
| Offline | PARTIAL | Catalog cache + downloads offline; live families need net | Clear offline UX everywhere | Connectivity advisory only; no global banner | `catalogCache.ts`, downloads, `useDesktopConnectivity.ts` | M | 1–2d | Med |
| Error handling | PARTIAL | Catalog stale banner; Sports offline; fallback.html on crash | Consistent error ownership | Uneven across families | `App.tsx`, `fallback.html` | M | 2d | Med |
| Packaging | PARTIAL | NSIS builds; artifact exists at 0.0.1 | Versioned release + signed installer | Version still `0.0.1`; signing off | `package.json` build | M | 1–2d | Med |
| Auto-update | NOT IMPLEMENTED | No updater | Production auto-update channel | No electron-updater / publish | — | L | 3–5d | High |
| Crash recovery | PASS | `fallback.html` on missing dist / load fail / render-process-gone | Recoverable shell message | — | `main.js`, `fallback.html` | — | — | — |

\*Sports stream productization is **out of scope for parity with mobile** if streams remain intentionally off. Desktop should match honesty (browse + no false Watch Live).  
\*Premium checkout only required if product decision says membership is a launch gate; mobile currently treats Premium largely as chrome.

---

## Desktop-only focus items

| Area | Status | Notes |
|------|--------|-------|
| Music page | PARTIAL | Feature-rich; Downloads stub dishonest |
| Home page | PARTIAL | Real Recently Added (verifier PASS); fillers + polish remain |
| Genre loading | PARTIAL | Bounded remote scan; empty-after-scan risk |
| Search | PASS | Global search implemented |
| Recently Added | PASS | Truthfulness verifier PASS; no Sunset Dreams/Jaden Moore in source |
| Player transitions | PASS | Route-media verifier PASS |
| TV | PASS | HLS + shared video owner |
| Sports | BLOCKED (streams) | Empty/fixtures-only until API + legal streams |
| Motivationals | PASS / PARTIAL visual | Video layout verify exists |
| Downloads | PASS | Real Electron downloads |
| Premium | PARTIAL | Honest preview only |
| Authentication | NOT IMPLEMENTED | Product auth missing |
| Window resizing | PASS | Min size enforced |
| Offline | PARTIAL | Cache + downloads |
| Error handling | PARTIAL | Partial coverage |
| Packaging | PARTIAL | Works at 0.0.1 |
| Installer | PARTIAL | NSIS exists; not release-versioned |
| Auto-update | NOT IMPLEMENTED | — |
| Crash recovery | PASS | fallback.html |

---

## Working systems (summary)

Playback owner/mutex, route-independent media, Music/Radio/Podcasts/Audiobooks/Motivationals/Lectures/TV browse+play paths, Downloads, Playlists, Library, History, Search, Worlds/Moods, Album/Artist detail, Electron security baseline, TypeScript+ESLint clean, production Vite build, Recently Added honesty, Premium honesty.

## Incomplete systems

Auth product, Premium billing, Settings depth, Genre rooms depth, Recommendations product, More hub, Keyboard shortcut documentation, Offline global UX, Auto-update, Release versioning/signing, Dirty-tree freeze.

## Broken / dishonest surfaces

- Music subnav Downloads copy claims offline unavailable while Downloads page works (`MusicSectionContent.tsx`)
- Artist Follow prompts sign-in with no sign-in UI
- Sports may present play affordances depending on API while streams are not launch-proven (align to mobile streams-off honesty)

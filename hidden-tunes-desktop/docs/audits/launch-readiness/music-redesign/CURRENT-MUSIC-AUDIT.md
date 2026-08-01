# Phase 7 — Current Music audit

## Routing

No React Router. App state machine in `src/App.tsx`:

- `activeNavKey` + `activePage` + `activeView`
- Home: `'home'` → `MusicHomePage`
- Music workspace: `'music'` → `MusicWorkspace` / Discover sections
- Details: `activeView` `'album'` | `'artist'` | `'mood'` | `'song'`
- Expanded player: overlay `PremiumFullscreenShell`

## Home component tree

```text
AppShell → CatalogDetailRouter → PageContent(home)
  → HomePage → MusicHomePage
       sections: hero, Recently Added, Top Charts*, Moods, Genres,
                 Explore families, Because You Listened, Smart Queue,
                 Creators, Albums, Open Rooms, All Songs
```

\*Top Charts used static labels + “Top 100” copy (truthfulness risk).

## Album card defect

**Preferred:** card body → album details; Play → play album.

**Found:** whole album card body called `playAlbumCollection`; separate “Details” button opened album.

Play did **not** navigate away (`context: 'home'`), but interaction split was inverted.

## Competing Music destination

`MusicWorkspace` remains a secondary browse surface. Product rule: Home owns discovery; do not redesign Music into a second catalogue competing with Home.

## Protected systems (unchanged ownership)

- `DesktopPlaybackProvider` / `HtmlAudioPlaybackService`
- Queue ownership, playback mutex, route-independent media
- Shared video singleton, Motivational layout, Electron security, Premium honesty
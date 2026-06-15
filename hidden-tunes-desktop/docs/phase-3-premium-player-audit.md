# Phase 3A — Premium Player System Audit + Control Map

**Date:** 2026-06-14  
**Scope:** `hidden-tunes-desktop` only  
**Task:** Audit only — no code changes, no commit  
**Sources:** Repository inspection, `git status`, `npm run build`, `docs/psd-final-validation-report.md` (44Q)

---

## Verification commands

### `git status` (WSL: `/home/wills/hidden-tunes-app/hidden-tunes-desktop`)

- Branch: `master`, ahead of `origin/master` by 53 commits
- **Staged:** `scripts/phase-44p-players.py`, `src/App.css`, `src/App.tsx`
- **Unstaged / untracked:** Many parent-repo and desktop files outside Phase 3A scope (including `../components/navigation/AppShell.web.tsx`, `DesktopPlayerFooter.web.tsx`, `desktopPlayerRoutes.ts` — excluded per project rules)
- This audit document is **untracked** until explicitly committed

### `npm run build`

```
> hidden-tunes-desktop@0.0.1 build
> tsc -b && vite build

vite v8.0.14 building client environment for production...
✓ 50 modules transformed.
✓ built in 734ms

dist/index.html                   0.48 kB
dist/assets/index--fN2d6mg.css  311.40 kB
dist/assets/index-CuOU27FF.js   472.55 kB
```

**Result:** PASS (TypeScript + Vite production build succeeded)

---

## 1. Existing player files and components

### Full-screen shells (all defined in `src/App.tsx`)

| Mode | Component | Approx. lines | CSS root class |
| --- | --- | --- | --- |
| Player 1 / Classic Vinyl / Cinema | `CinemaPlayerShell` | ~7012–7271 | `cinema-player--psd-master` |
| Player 2 / Premium PSD Player | `Player2Shell` | ~7273–7584 | `player2-shell` |
| Player 3 / Cinematic Waveform | `Player3Shell` | ~7586–8007 | `player3-shell` |
| Player 4 / Theater Mode | `Player4Shell` | ~8009–8420 | `player4-shell` |
| Player 5 / Ambient World Player | `Player5Shell` | ~8422–8913 | `player5-shell` |
| Waveform Overlay | `CinematicWaveformShell` | ~8915–9122 | `cinema-player--waveform` |
| Lyrics Overlay | `FullscreenLyricsShell` | ~9124–9317 | `cinema-player--lyrics` |

### Footer and sidebar

| Surface | Component | Approx. lines |
| --- | --- | --- |
| Footer Player | `PlayerBar` | ~5893–6269 |
| Now Playing Sidebar | `QueueUpNextPanel` | ~6272–6747 |

### Shared transport and shell helpers (in `src/App.tsx`)

| Symbol | Role |
| --- | --- |
| `PlaybackTransportControls` | Footer transport (optional shuffle/repeat) |
| `FullPlayerTransportControls` | Full-screen PSD transport (shuffle/repeat unless hidden) |
| `usePlayerShellState` | Shared track/progress/quality derivation for Player 1 |
| `usePlayerShellChrome` | Body scroll lock + Escape-to-close |
| `PlayerLyricsEmptyState` | Honest “lyrics unavailable” placeholder |
| `PlayerQueuePanel` | Clickable queue list (Player 1 queue tab) |
| `PlayerDetailsPanel` | Track metadata panel (Player 1 details tab) |
| `AudioQualitySelector` | Quality mode picker (footer + waveform overlay) |

### Extracted modules

| Path | Role |
| --- | --- |
| `src/context/DesktopPlaybackProvider.tsx` | Playback state + actions |
| `src/lib/desktopPlayback/types.ts` | Playback types and action surface |
| `src/lib/desktopPlayback/HtmlAudioPlaybackService.ts` | HTML5 audio engine |
| `src/lib/desktopPlayback/queueIntelligence.ts` | Auto queue extension |
| `src/lib/desktopPlayback/audioUpgradeDiagnostics.ts` | Quality upgrade logging |
| `src/lib/nowPlayingStyle.ts` | Preferred player style (`player-1` … `player-5`) |
| `src/lib/useAutoOpenPreferredPlayer.ts` | Auto-open after song tap |
| `src/components/PremiumReactiveWaveform.tsx` | Seekable reactive bar waveform |
| `src/components/PremiumCinematicWaveform.tsx` | Full-screen cinematic visualizer |
| `src/components/PremiumAudioVisualizerProvider.tsx` | Boots visualizer engine from playback |
| `src/lib/premiumAudioVisualizer/engine.ts` | Web Audio analyser + fallback animation |
| `src/lib/premiumAudioVisualizer/usePremiumAudioVisualizer.ts` | Engine boot hook |
| `src/lib/premiumAudioVisualizer/waveformSeed.ts` | Seeded bar heights per track |
| `src/data/artworkRegistry.ts` → `resolvePlayerBackground()` | Player background URLs |
| `src/App.css` | All player/sidebar/footer PSD styles |

### Design reference assets (not imported in production UI)

- `src/assets/psd-player-master-reference.jpg` (Player 1)
- `src/assets/psd-player2-reference.jpg` … `psd-player5-reference.jpg`
- `public/artwork/player-backgrounds/*` (registry backgrounds)

### Legacy PSD constants

`App.tsx` still contains `PSD_PLAYER*` / `PSD_PLAYER2*` … constants (~lines 322–449) from design reconstruction. Shells use **live playback data**, not these constants, for titles/artists/queue.

---

## 2. Visual completeness by player mode

Per `docs/psd-final-validation-report.md` §3 and code structure inspection:

| Mode | Visual status | Evidence |
| --- | --- | --- |
| Player 1 / Cinema | **Complete shell** | Full PSD layout: topbar, art, tabs, waveform row, transport, volume, utilities; `resolvePlayerBackground('master')` |
| Player 2 | **Complete shell** | Sidebar nav, hero art, waveform, transport, status bar, lyrics panel |
| Player 3 | **Complete shell** | VIP sidebar, disc stage, tabs (lyrics/visualizer/details), up-next rail, stats |
| Player 4 | **Complete shell** | Theater layout, hero play CTA, lyrics card, dock, up-next rail |
| Player 5 | **Complete shell** | Ambient layout, inline art play, lyrics column, dock, stats rail |
| Waveform Overlay | **Complete shell** | Cinematic hero, `PremiumCinematicWaveform`, progress, transport, quality footer |
| Lyrics Overlay | **Complete shell** | Topbar, art + track copy, lyrics stack, progress, transport, quality label |
| Footer Player | **Complete shell** | Track meta, transport, seek, quality, volume, player open buttons (1–3) |
| Now Playing Sidebar | **Complete shell** | Standard PSD rail + luxury albums/playlists variant |

**44Q parity note:** Visual parity rated **Good** (~88% in readiness score). Remaining gaps are minor spacing vs reference JPEGs, not missing layout regions.

---

## 3. Controls fully wired

### `DesktopPlaybackProvider` actions (available everywhere via `useDesktopPlayback()`)

`playTrack`, `playQueue`, `next`, `previous`, `pause`, `resume`, `seekTo`, `setVolume`, `getUpcomingTracks`, `playQueueAtIndex`, `clearUpcomingQueue`, `toggleShuffle`, `toggleRepeat`, `setAudioQualityMode`

### By surface

| Surface | Wired controls |
| --- | --- |
| **Footer `PlayerBar`** | Play/pause, prev/next, shuffle, repeat, seek bar, mute/volume, `AudioQualitySelector`, open Player 1 / 2 / 3 |
| **Sidebar `QueueUpNextPanel`** | Seek, volume, transport (play/pause/prev/next — shuffle/repeat **hidden**), Clear queue, up-next row click → `playQueueAtIndex`, luxury rail reactive waveform + seek, “Show Full Player” → Player 3, expand → Player 2 |
| **Player 1** | Close (no stop), tabs, seek via `PremiumReactiveWaveform`, volume, `FullPlayerTransportControls` (incl. shuffle/repeat), queue tab (`PlayerQueuePanel` clickable), details tab, utilities → waveform overlay / queue tab / lyrics overlay |
| **Player 2** | Close, sidebar nav → `onNavigateNav`, seek, volume, transport + shuffle/repeat, Equalizer → waveform, next-card play → `next()`, SHOW FULL LYRICS → lyrics overlay |
| **Player 3** | Close, sidebar nav, tabs, seek (main + visualizer tab), volume, transport + shuffle/repeat, Equalizer (header + footer) → waveform, SHOW FULL LYRICS, Fullscreen util → close |
| **Player 4** | Close, sidebar nav, hero Play/Pause, seek, volume, transport + shuffle/repeat, Visualizer tab → waveform, SHOW FULL LYRICS, Equalizer dock → waveform, Theater util → close |
| **Player 5** | Close, sidebar nav, art Play/Pause, seek, volume, transport + shuffle/repeat, Equalizer → waveform, SHOW FULL LYRICS, Go Premium → `premium` nav, Fullscreen → close |
| **Waveform overlay** | Close, seek, transport + shuffle/repeat, quality toggle + `AudioQualitySelector` |
| **Lyrics overlay** | Close, seek, transport + shuffle/repeat, live quality label |

**Close behavior:** All shells use `usePlayerShellChrome(onClose)` — Escape and close buttons dismiss overlay only; they do **not** call `pause()` or stop playback.

---

## 4. Controls decorative (visible, no handler or static chrome)

| Location | Control | Notes |
| --- | --- | --- |
| Player 1 | Topbar menu span | `aria-hidden`, non-interactive |
| Player 2 | Soundstage, Timer | Buttons with no `onClick` |
| Player 2 | Device picker (`player2-device`) | Static “Headphones / Desktop Output” |
| Player 2 | PLAY QUEUE | No handler |
| Player 2 | Profile chevron / avatar | Display only |
| Player 3 | Source button (`player3-source-btn`) | No handler |
| Player 3 | ATMOS, LOUDNESS footer tools | No handler |
| Player 3 | Queue, Brightness footer utils | No handler |
| Player 3 | Up-next menu buttons (non-active rows) | No handler |
| Player 3 | Stats graph / PLAYS `—` | Static / honest placeholder |
| Player 4 | Source button | No handler |
| Player 4 | Lyrics tab button (vs Visualizer) | Visual only; Visualizer tab wired |
| Player 4 | Queue, Settings dock utils | No handler |
| Player 4 | Up-next rows | Display only — no `playQueueAtIndex` |
| Player 5 | Source button | No handler |
| Player 5 | ATMOS, crossfade toggle | No handler; crossfade shows `is-on` statically |
| Player 5 | Favorite, Queue, Theme dock utils | No handler |
| Player 5 | Sidebar Settings, Notifications | No handler |
| Player 5 | Up-next header menu, stats period | No handler |
| Player 5 | Stats LIKES / PLAYS `—` | Static placeholders |
| Lyrics overlay | Bookmark / flag topbar button | No handler |
| Waveform overlay | Topbar placeholder span, pager dots | Decorative |
| Footer | — | No Player 4/5 open buttons; no direct waveform/lyrics buttons |
| Sidebar | Waveform icon in luxury header | Decorative (`aria-hidden`) |

**Embedded sidebars (Players 2–5):** Nav buttons **are wired** via `handleNav` → close player + `onNavigateNav`. Profile labels (“PREMIUM”, “Premium Member VIP”) are placeholder copy.

---

## 5. Controls that should be wired (Phase 3B+ candidates)

Priority based on user-visible affordance and existing playback APIs:

| Control | Recommended wiring |
| --- | --- |
| Player 2 PLAY QUEUE | Toggle queue drawer or navigate to queue tab pattern (Player 1 has `PlayerQueuePanel`) |
| Player 3 / 4 / 5 Queue dock/footer utils | Open queue panel or scroll to up-next rail; reuse `PlayerQueuePanel` or `playQueueAtIndex` on rows |
| Player 3 / 4 / 5 up-next rows | `playQueueAtIndex(currentIndex + 1 + offset)` — sidebar already does this |
| Player 2 device picker | Output device selection (blocked until desktop audio routing exists) |
| Player 3 source / Player 4–5 source buttons | Navigate to album context or show queue source metadata |
| Footer Player 4 / 5 buttons | Mirror Player 1–3 open pattern (`openPlayer4`, `openPlayer5`) |
| Preferred player picker | Call `setPreferredNowPlayingStyle()` — function exists, **zero call sites** |
| Lyrics bookmark | Requires lyrics + user-state backend |
| Player 5 Favorite | Requires liked-songs backend |
| ATMOS / LOUDNESS / Soundstage / crossfade | Requires audio processing backend or honest hide |

---

## 6. Controls that should be hidden (until backend exists)

Aligned with 44Q §7 “buttons intentionally hidden” pattern and current decorative inventory:

| Hide candidate | Reason |
| --- | --- |
| Player 2 Soundstage, Timer | No implementation path in desktop preview |
| Player 2 device picker (or disable + tooltip) | No multi-output API |
| Player 2 PLAY QUEUE (until wired) | Misleading affordance |
| Player 3 ATMOS, LOUDNESS, Queue, Brightness | Unwired dock tools |
| Player 3 up-next row menus | No context menu implementation |
| Player 4 Queue, Settings dock utils | Unwired |
| Player 5 ATMOS, crossfade, Favorite, Queue, Theme | Unwired |
| Player 5 sidebar Settings, Notifications | Unwired |
| Player 5 up-next menu, stats period | Unwired |
| Lyrics bookmark button | No bookmark backend |
| Waveform overlay decorative dots | Non-functional pager |

**Do not hide:** Equalizer buttons (they correctly open waveform overlay), Fullscreen/Theater close buttons, Go Premium (wired to Premium page).

---

## 7. Shared playback functions available

From `DesktopPlaybackProvider` / `src/lib/desktopPlayback/types.ts`:

### State

`currentTrack`, `currentQueue`, `currentIndex`, `queueContext`, `queueSeedType`, `queueSeedId`, `queueTitle`, `isPlaying`, `isLoading`, `error`, `positionSeconds`, `durationSeconds`, `volume`, `audioQualityMode`, `shuffleEnabled`, `repeatMode`

### Actions

| Action | Behavior (from provider inspection) |
| --- | --- |
| `playTrack(song)` | Single-track manual queue |
| `playQueue(queue, index, context, title?, seed?)` | Sets queue; respects shuffle-at-start; extends queue via `queueIntelligence` |
| `next()` / `previous()` | Index navigation; honors repeat-all at ends |
| `pause()` / `resume()` | HTML audio control |
| `seekTo(seconds)` | Clamped seek |
| `setVolume(0–1)` | HTML audio volume |
| `getUpcomingTracks()` | Slice after current index |
| `playQueueAtIndex(index)` | Jump within queue |
| `clearUpcomingQueue()` | Trims queue after current track; resets seed to manual |
| `toggleShuffle()` | Reshuffles upcoming or restores `unshuffledQueueRef` |
| `toggleRepeat()` | Cycles `off` → `all` → `one` |
| `setAudioQualityMode(mode)` | Persisted preference; triggers tier selection + upgrade path |

### Shell-level shared helpers

- `usePlayerShellState(preferredTrack)` — Player 1 unified display state
- `usePlayerShellChrome(onClose)` — modal chrome
- `selectAndPlay()` in `App` — play + schedule auto-open preferred player

### Visualizer integration

- `PremiumAudioVisualizerProvider` syncs playback state into `premiumAudioVisualizerEngine`
- `PremiumReactiveWaveform` — seek + bar registration
- `PremiumCinematicWaveform` — cinematic bar registration (no seek on component itself; overlay has separate seek bar)

---

## 8. Current preferred-player routing behavior

### State flags (`App.tsx` ~10044–10074)

```
cinemaOpen, player2Open, player3Open, player4Open, player5Open
waveformOpen, lyricsOpen
anyPlayerOverlayOpen = OR of all seven
```

### `openPlayerByStyle(style)` (~10076–10082)

Sets **exactly one** of `cinemaOpen` … `player5Open` to `true` based on style; others `false`. Does **not** open waveform or lyrics.

### Explicit open helpers

| Helper | Sets |
| --- | --- |
| `openCinemaPlayer()` | `cinemaOpen = true` (cancels auto-open timer) |
| `openPlayer2()` | `player2Open = true` |
| `openPlayer3()` | `player3Open = true` |
| *(none)* | No `openPlayer4()` / `openPlayer5()` exported to UI |

### Auto-open (`useAutoOpenPreferredPlayer`)

- Triggered by `selectAndPlay()` → `scheduleAutoOpenPlayerAfterSongTap(trackId)`
- Delay: `AUTO_OPEN_PLAYER_DELAY_MS = 1500`
- Opens `getPreferredNowPlayingStyle()` via `openPlayerByStyle`
- Cancelled on: navigation change, leaving song view after visiting it, playback stop after start, any player overlay already open

### Preference storage (`nowPlayingStyle.ts`)

- Key: `hidden-tunes-now-playing-style`
- Values: `player-1` … `player-5`
- Default: `player-1`
- `getPreferredNowPlayingStyle()` — **read** in auto-open hook
- `setPreferredNowPlayingStyle()` — **defined but never called** anywhere in `src/`

### UI entry points to players

| Entry | Players reachable |
| --- | --- |
| Footer buttons | Player 1, 2, 3 only |
| Sidebar | Player 2 (expand), Player 3 (Show Full Player) |
| Auto-open after play | Whichever style is in localStorage (default Player 1) |
| Player 4 / 5 | **Only** via auto-open when preference is `player-4` or `player-5` (no UI to set preference) |
| Waveform / Lyrics | Opened from within players; not part of `NOW_PLAYING_STYLES` |

### Footer visibility

Hidden when: `waveformOpen || lyricsOpen || player2Open || player3Open || player4Open || player5Open || activeNavKey === 'recent'`

Note: Footer remains visible when **only** `cinemaOpen` (Player 1) is true.

### Overlay handoff

Opening waveform or lyrics from a player shell closes that shell first (`setPlayerNOpen(false)` then `setWaveformOpen(true)` / `setLyricsOpen(true)`).

---

## 9. Shuffle / repeat implementation status

| Layer | Status |
| --- | --- |
| **Engine** | `toggleShuffle` / `toggleRepeat` in `DesktopPlaybackProvider`; shuffle reshuffles upcoming; repeat handles `off` / `all` / `one` on ended + next/prev |
| **Footer** | `PlaybackTransportControls` with `showShuffleRepeat` — wired |
| **Full-screen players** | `FullPlayerTransportControls` — shuffle/repeat wired (default `hideDecorativeControls=false`) |
| **Sidebar** | `FullPlayerTransportControls` with `hideDecorativeControls` — shuffle/repeat **not rendered** |
| **Waveform / Lyrics overlays** | Full shuffle/repeat via `FullPlayerTransportControls` |

---

## 10. Lyrics implementation status

| Item | Status |
| --- | --- |
| Synced lyrics API | **Not present** in desktop catalog |
| `PlayerLyricsEmptyState` | Used in Player 1–5, waveform overlay, lyrics overlay |
| Player 1 lyrics tab | Empty state only |
| Player 2 / 3 / 5 embedded lyrics | Empty state + “SHOW FULL LYRICS” → `FullscreenLyricsShell` |
| Player 4 lyrics card | Empty state; lyrics tab decorative, visualizer tab opens waveform |
| `FullscreenLyricsShell` | Empty state + transport/seek/quality label |
| Legacy `PSD_PLAYER*_LYRICS*` constants | Remain in `App.tsx` but are **not** rendered in shells (removed in 44P per 44Q) |

---

## 11. Visualizer / audio-reactive implementation status

| Component | Status |
| --- | --- |
| `PremiumAudioVisualizerEngine` | Web Audio `AnalyserNode` on `audio[data-ht-playback="true"]`; falls back to seeded animation when no signal / reduced motion |
| `PremiumAudioVisualizerProvider` | Mounted in `App` around main tree; feeds engine playback state |
| `PremiumReactiveWaveform` | Used in Player 1–5, sidebar luxury rail; seek wired; bars animate via engine |
| `PremiumCinematicWaveform` | Waveform overlay hero visualizer |
| Player 3 visualizer tab | `PremiumReactiveWaveform` panel |
| Engine snapshot fields | `isAudioReactive`, `isFallback`, energy bands — engine tracks connection state |

**Inspection note:** Reactivity depends on successful `MediaElementAudioSourceNode` connection to the playback audio element. Fallback path is implemented in engine when connection fails or audio is silent.

---

## 12. Queue integration status

| Surface | Queue integration |
| --- | --- |
| `DesktopPlaybackProvider` | Full queue state, extension, shuffle, repeat, `playQueueAtIndex`, `clearUpcomingQueue` |
| Footer | Displays queue position when `currentQueue.length > 1` |
| Sidebar (standard + luxury) | Live up-next from `getUpcomingTracks()`; rows clickable; Clear wired |
| Player 1 queue tab | `PlayerQueuePanel` — full queue from current index, rows clickable |
| Player 2 | Next preview card + `next()` on play button; PLAY QUEUE unwired |
| Player 3 / 4 / 5 rails | Live `getUpcomingTracks()` slice (5 rows); **rows not clickable** |
| Player 3 / 5 stats | `queueCount` from `currentQueue.length`; duration from current track |

---

## 13. Audio quality integration status

| Surface | Integration |
| --- | --- |
| `DesktopPlaybackProvider` | `audioQualityMode` persisted via `usePersistedPreference`; `selectPlayableUrlForQualityMode` + upgrade session after stable playback |
| Footer | `AudioQualitySelector` (compact) — wired |
| Settings page | `AudioQualitySelector` — wired |
| Waveform overlay | Toggle panel + `AudioQualitySelector` — wired |
| Player 1 | Read-only `qualityLabel` badge |
| Players 3–5, lyrics overlay | Read-only `qualityLabel` from mode or track badge |
| Player 2 | No quality selector (no quality pill in shell) |
| Decorative ATMOS / LOUDNESS buttons | **Not** connected to `setAudioQualityMode` |

Modes (from `AUDIO_QUALITY_MODE_LABELS` usage): auto, standard, high, lossless, data-saver (exact set in `localPreferences`).

---

## 14. Gaps blocking Phase 3 completion

### Routing / product gaps

1. **No UI to set preferred player** — `setPreferredNowPlayingStyle()` unused; Players 4–5 unreachable without manual localStorage edit
2. **No footer/sidebar launchers for Player 4 / 5**
3. **Waveform and lyrics overlays** excluded from preferred-player auto-open model
4. **No in-player switcher** between Player 1–5 without closing and using footer (and footer hidden when Players 2–5 open)

### Wiring gaps (honesty / UX)

5. Decorative dock tools across Players 2–5 (see §4)
6. Up-next rails in Players 3–5 not clickable (sidebar pattern exists)
7. Player 2 PLAY QUEUE unwired
8. Player 4 duplicate play control (hero + transport) — both wired, not a bug

### Backend-blocked

9. Synced lyrics API
10. Favorites / bookmarks
11. Play history stats (PLAYS, LIKES show `—`)
12. Crossfade, ATMOS, loudness, soundstage processing
13. Audio output device picker
14. Account/profile state for sidebar “Premium User” labels

### Technical debt (non-blocking for Phase 3B UI)

15. Monolithic `App.tsx` (~10k+ lines) — all shells inline
16. Legacy `PSD_PLAYER*` constants still in file (dead data)
17. 44Q noted 16 pre-existing ESLint errors in `api.ts`, `artworkIntegrity.ts`, `localPreferences.ts`

---

## 15. Recommended implementation order for Phase 3B onward

Based on dependency order and existing stable APIs (not estimates):

### Phase 3B — Routing and discoverability

1. **Preferred player settings UI** — wire `setPreferredNowPlayingStyle()` (Settings or player chrome); document localStorage key
2. **Footer/sidebar open buttons for Player 4 and 5** — mirror `openPlayer2` / `openPlayer3` pattern
3. **In-app player mode switcher** — call `openPlayerByStyle` without stopping playback; optionally persist preference

### Phase 3C — Queue parity in premium shells

4. **Wire up-next rows** in Players 3–5 to `playQueueAtIndex`
5. **Wire queue affordances** — Player 2 PLAY QUEUE, Player 3–5 queue dock buttons → shared `PlayerQueuePanel` or rail focus
6. **Unify queue display** — consider reusing `PlayerQueuePanel` in Player 2 sidebar

### Phase 3D — Honesty pass (hide or wire)

7. **Hide decorative controls** listed in §6 (match 44Q pattern for downloads/liked)
8. **Player 2 device picker** — hide or show “Desktop Output (fixed)” disabled state
9. **Remove or gate static crossfade `is-on`** on Player 5

### Phase 3E — Premium features (backend-dependent)

10. **Lyrics integration** when catalog endpoint exists — replace `PlayerLyricsEmptyState` with synced view in all shells
11. **Favorites / bookmarks** — Player 5 heart, lyrics flag
12. **Listening stats** — replace `—` placeholders when play history exists
13. **Audio FX** — ATMOS, loudness, soundstage, crossfade only when audio pipeline supports them

### Phase 3F — Polish

14. **Pixel pass** against `src/assets/psd-player*-reference.jpg` at full resolution (44Q recommendation)
15. **Extract player shells** from `App.tsx` into dedicated components (maintainability, not user-facing)
16. **Clean legacy `PSD_PLAYER*` constants** once parity signed off

---

## Control map summary (quick reference)

```
DesktopPlaybackProvider
├── Footer PlayerBar ─────────── transport, seek, volume, quality, open P1/P2/P3
├── QueueUpNextPanel ─────────── transport (no S/R), seek, volume, queue, open P2/P3
├── CinemaPlayerShell (P1) ─── full transport, queue tab, waveform, lyrics, utilities
├── Player2Shell ───────────── transport, seek, volume, next play, lyrics, waveform
├── Player3Shell ───────────── transport, seek, volume, tabs, waveform, lyrics
├── Player4Shell ───────────── transport, hero play, seek, volume, lyrics, waveform
├── Player5Shell ───────────── transport, art play, seek, volume, lyrics, waveform, premium
├── CinematicWaveformShell ─── seek, transport, quality selector
└── FullscreenLyricsShell ──── seek, transport, quality label (read-only)

Preferred player: localStorage → auto-open 1.5s after play
setPreferredNowPlayingStyle: NO UI CALL SITES
Player 4/5 open: auto-open only (no footer buttons)
```

---

*End of Phase 3A audit. No repository code was modified for this document.*

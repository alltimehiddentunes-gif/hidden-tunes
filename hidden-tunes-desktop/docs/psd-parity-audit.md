# PSD Parity Audit — Phase 44E

**Date:** 2026-06-14  
**Scope:** `hidden-tunes-desktop` visual + wiring audit against PSD reference assets  
**PSD rule:** PSD wins on all visual disagreements. Playback, queue, search engine, backend, and mobile are out of scope.

## Reference assets (design-only — never imported in app code)

| Asset | Target page / surface |
| --- | --- |
| `emotional-worlds-reference.jpg` | Emotional Worlds |
| `psd-library-reference.jpg` | Library |
| `psd-liked-reference.jpg` | Liked Songs / playlist detail |
| `psd-playlist-reference.jpg` | Playlist detail |
| `psd-albums-reference.png` | Albums grid + luxury rail |
| `psd-recent-reference.jpg` | Home recent / discovery |
| `psd-downloads-reference.jpg` | Downloads (inferred) |
| `psd-now-playing-reference.jpg/png` | Now Playing sidebar |
| `psd-player-reference.jpg` | Footer player |
| `psd-player-master-reference.jpg` | Full-screen player master |
| `psd-player2-reference.jpg` … `psd-player5-reference.jpg` | Player variants (blocked until 44Q) |
| `psd-waveform-reference.jpg` | Waveform player |
| `psd-lyrics-reference.jpg` | Lyrics player |

## Artwork system status (post 44C + 44D)

| Check | Status |
| --- | --- |
| Registry in `src/data/artworkRegistry.ts` | ✅ heroes, playlists, worlds, player backgrounds, premium |
| Screenshot crop coordinates (`artPosition`) | ✅ removed from `App.tsx` |
| Oversized `background-size` crop CSS | ✅ normalized to `cover` / `center` |
| PSD reference JPGs in production UI | ✅ none imported |
| Catalog song/album art from API | ✅ via `pickSongArtwork` / `pickAlbumArtwork` |
| Artist portraits from API + SVG placeholders | ✅ no song art used as portrait |

## Page audit summary

### Home — Phase 44F

| Area | PSD parity | Wiring | Artwork |
| --- | --- | --- | --- |
| Hero banner | ⚠️ Real hero art wired; verify headline layout, veil gradient, height vs PSD | N/A (display) | ✅ `getArtworkForHero('home')` |
| Popular Worlds row | ⚠️ Card aspect, play overlay, typography need PSD pass | ✅ play + select wired to catalog scenes | ✅ world registry + catalog |
| Emotional lanes / browse | ⚠️ Secondary home sections spacing and card density | ✅ filter + play wired | ✅ catalog art |
| Radio / discover rows | ⚠️ Row chrome and badge placement | ✅ radio start wired | ✅ catalog art |

**44F actions:** Match hero min-height, headline accent color/weight, Popular Worlds card 3:4 ratio and play button size, section gutters to PSD.

---

### Emotional Worlds — Phase 44G

| Area | PSD parity | Wiring | Artwork |
| --- | --- | --- | --- |
| Hero | ⚠️ Title split (“Emotional” / “Worlds”), veil stack, copy max-width | N/A | ✅ registry hero |
| Category chips | ⚠️ Chip radius, active gold/violet state | ✅ filter wired | N/A |
| World grid cards | ⚠️ Card art aspect ~3:4.15, play FAB, hover lift | ✅ play + select wired | ⚠️ verify each card maps to correct world art |

**44G actions:** Pixel-match hero typography and chip row; audit all `EMOTIONAL_WORLDS_CARDS` against `worldArtwork` registry keys.

---

### Search — Phase 44H

| Area | PSD parity | Wiring | Artwork |
| --- | --- | --- | --- |
| Page header + tabs | ✅ close | ✅ tabs switch panels | N/A |
| Top result card | ⚠️ Labels still PSD constants (`PSD_SEARCH_TOP_RESULT`) while art is live | ✅ play wired | ✅ live top result art |
| Songs list | ⚠️ Row titles/durations are PSD constants, not query matches | ✅ rows play real songs at index | ✅ live thumbs |
| Artists panel | ⚠️ Row labels PSD constants | ❌ rows have no `onClick` / navigation | ✅ avatars when matched |
| Albums panel | ⚠️ Row labels PSD constants | ❌ rows have no `onClick` / navigation | ✅ art when matched |
| View all / heart / plus / more | ⚠️ Visible in PSD | ❌ decorative (no handlers) | N/A |

**44H actions:** Wire artist/album rows to open detail views; replace PSD label constants with live search results; wire secondary actions or hide per PSD if non-interactive.

---

### Library — Phase 44I

| Area | PSD parity | Wiring | Artwork |
| --- | --- | --- | --- |
| Header + tabs | ⚠️ Tab underline style vs PSD | ⚠️ tabs switch state but content does not filter | N/A |
| Stats row | ⚠️ Card tones and iconography | ❌ static PSD constants | N/A |
| Recently Added | ⚠️ Carousel arrows, card shadows | ✅ play wired; ❌ view-all / prev / next dead | ✅ catalog |
| Your Playlists | ⚠️ Collage layout vs PSD | ❌ view-all dead; cards not openable | ✅ collage from catalog |
| Add New | ⚠️ Button in PSD | ❌ no handler | N/A |

**44I actions:** Filter library content by tab; wire stats to real counts; wire playlist cards to playlist detail; wire carousel and view-all.

---

### Playlist detail — Phase 44J

| Area | PSD parity | Wiring | Artwork |
| --- | --- | --- | --- |
| Hero (square art + copy) | ⚠️ Layout uses PSD classes; verify art frame size | ✅ play/shuffle on liked variant | ✅ registry + collage |
| Track table | ⚠️ Column widths, active row highlight | ✅ play per row on liked | ✅ catalog |
| Luxury Now Playing rail | ⚠️ Rail width, vinyl, up-next thumbs | ✅ queue from playback when active | ✅ catalog |

**44J actions:** Match `psd-playlist-reference.jpg` hero proportions; ensure Night Drive playlist uses `playlist-night-drive.jpg`.

---

### Artist — Phase 44K

| Area | PSD parity | Wiring | Artwork |
| --- | --- | --- | --- |
| Artist grid | ⚠️ Card circle size, verified badge | ✅ opens detail | ✅ portraits |
| Artist detail hero | ⚠️ Backdrop blur, avatar ring, stat line | ⚠️ partial | ✅ portrait not song art |
| Popular tracks | ⚠️ Table row density | ✅ play wired | ✅ catalog |
| Albums rail | ⚠️ Horizontal scroll chrome | ⚠️ partial navigation | ✅ catalog |
| Related artists | ⚠️ Chevron rows in PSD | ❌ likely dead | ⚠️ verify |

**44K actions:** Match `psd-artist-reference` (inferred from artists page CSS); wire related-artist navigation.

---

### Album — Phase 44L

| Area | PSD parity | Wiring | Artwork |
| --- | --- | --- | --- |
| Albums grid | ⚠️ 6-column at 1500px+, card meta line | ✅ opens detail | ✅ catalog |
| Luxury rail | ⚠️ `psd-albums-reference.png` rail stage | ✅ playback wired | ✅ catalog |
| Album detail | ⚠️ Hero + track list vs PSD | ✅ play wired | ✅ catalog |

**44L actions:** Grid gap and footer count line; rail “Falling Slowly” labels vs live track when playing.

---

### Premium — Phase 44M

| Area | PSD parity | Wiring | Artwork |
| --- | --- | --- | --- |
| Hero | ⚠️ Gold CTA, glow layers; subtitle admits “inferred” | ❌ buttons dead | ✅ `getArtworkForPremium('hero')` |
| Perk grid | ⚠️ Card icon + copy vs PSD sidebar CTA | ❌ display only | N/A |

**44M actions:** Replace inferred copy with PSD-aligned premium page if reference exists; wire or stub CTAs.

---

### Now Playing sidebar — Phase 44N

| Area | PSD parity | Wiring | Artwork |
| --- | --- | --- | --- |
| Rail shell | ⚠️ Match `psd-now-playing-reference` | ✅ live queue when tracks playing | ✅ catalog thumbs |
| Stage art + vinyl | ⚠️ Frame border, glow, VIP badge | ✅ reflects current track | ✅ track art |
| Up Next list | ⚠️ Thumb size, duration column | ✅ live queue rows | ✅ catalog |
| Clear queue | ⚠️ Button in PSD | ❌ dead on luxury rail | N/A |

**44N actions:** Wire Clear; match rail typography and waveform icon placement to PSD.

---

### Footer player — Phase 44O

| Area | PSD parity | Wiring | Artwork |
| --- | --- | --- | --- |
| Bar layout | ⚠️ Match `psd-player-reference.jpg` | ✅ transport, seek, volume wired | ✅ track art |
| Progress + time | ⚠️ Gradient fill, thumb size | ✅ live | N/A |
| Queue context label | ⚠️ Typography | ✅ live | N/A |
| Open cinema / player shortcuts | ⚠️ PSD icon cluster | ⚠️ wired but variants blocked until 44Q | N/A |

**44O actions:** Visual pass only — no player variant work until 44Q.

---

### Full-screen player — Phase 44P (foundation only)

| Area | Status |
| --- | --- |
| Player master shell | ⚠️ Exists; needs PSD foundation pass against `psd-player-master-reference.jpg` |
| Player 2–5 | 🚫 Blocked until 44Q |
| Waveform / lyrics modes | 🚫 Blocked until 44Q |

---

## Cross-cutting wiring gaps (fix during 44F–44O)

1. **Search artist/album rows** — no navigation handlers  
2. **Library tabs** — state only, no content filter  
3. **Library stats** — hard-coded PSD values  
4. **Library / search “View all”** — dead buttons  
5. **Premium CTAs** — dead buttons  
6. **Queue Clear** — dead on luxury rail  
7. **PSD demo labels** — search/library rows show PSD titles instead of live data when catalog differs  

## Cross-cutting visual gaps

1. Section spacing and `PageFrame cinematic` padding vs PSD per page  
2. Typography scale (display font on H1s, metadata gray `--psd-metadata`)  
3. Tab active states (underline vs pill) per page reference  
4. Card hover/play affordances consistency  
5. Dead CSS `-fallback` classes remain in `App.css` (harmless; optional cleanup)  

## Recommended phase order (confirmed)

44F Home → 44G Worlds → 44H Search → 44I Library → 44J Playlist → 44K Artist → 44L Album → 44M Premium → 44N Sidebar → 44O Footer → 44P Player foundation → 44Q Final validation

## Sign-off criteria for 44Q

- [ ] Every page visually matches its PSD reference at 1440px and 1920px  
- [ ] No screenshot crops or reference JPG imports in production code  
- [ ] All visible buttons either work or are removed/hidden per PSD  
- [ ] No fake demo cards — live catalog or honest empty states  
- [ ] Correct entity artwork (song / album / artist / playlist / world)  
- [ ] `npm run build` clean; no parent nav files staged  

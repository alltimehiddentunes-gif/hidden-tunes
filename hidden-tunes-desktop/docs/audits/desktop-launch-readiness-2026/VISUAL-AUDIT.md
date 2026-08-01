# Visual Audit

**Method:** Source inspection + existing route captures under `docs/audits/catalog-runtime-config/` + architecture of CSS/player chrome.  
**Caveat:** Several older Home/Music PNGs still show fake “Sunset Dreams / Jaden Moore” cards. **Current source no longer contains those strings** (`verify:recently-added` PASS). Treat those PNGs as stale for Recently Added identity; still useful for layout/chrome critique.

---

## Global visual system

| Dimension | Assessment | Evidence |
|-----------|------------|----------|
| Visual hierarchy | Strong on branded surfaces; sometimes competing top-nav + sidebar | Screenshots + `GlobalTopNav` + sidebar groups |
| Spacing / rails | Generally generous; family pages consistent | Family page components |
| Alignment | Mostly coherent 3-pane shell | App shell |
| Typography | Brand serif/gold accents + sans UI | Home/TV heroes |
| Artwork | Mixed: strong heroes; some TV letter placeholders | TV channel cards |
| Card design | Premium dark cards with glass; occasional overlap bugs in older lecture captures | Lectures capture |
| Premium appearance | High intent; dark + purple glow + gold | Brand language established |
| Hero | Present on Home/TV/Lectures | Good first-viewport brand signal |
| Buttons / hover / focus | Present; full a11y focus audit not re-run this pass | Partial |
| Transitions | Player/cinema shells intentional | `PremiumFullscreenShell` |
| Responsiveness | Min window 1280×800; not a fluid phone layout (desktop-first OK) | `main.js` |
| Consistency | Dual navigation redundancy (sidebar + top pills) | Sports/TV/History captures |
| Background / glass / lighting | Atmospheric glows; glassmorphism | App.css (~688 KB source) |
| Player appearance | Persistent rail + footer + fullscreen — premium direction | Player components |
| Overall premium quality | **~72/100** — looks like a real product, not a prototype; unfinished pages and empty states still show | — |

---

## Screen-by-screen

| Screen | Premium feel | Unfinished signals | Priority |
|--------|--------------|--------------------|----------|
| Home | High | Dual nav; Personal Mix / fillers; ensure live Recently Added truth (source OK) | Major polish |
| Music | High | Downloads stub copy; section density | Major honesty + polish |
| Radio | Medium–High | Artwork/hero consistency | Minor |
| Podcasts | Medium–High | Category empty paths | Minor |
| Audiobooks | Medium–High | — | Minor |
| Motivationals | Medium–High | Video stage layout edge cases | Major if video |
| Lectures | Medium | Older capture: badge/title overlap on featured cards — **re-verify on current CSS** | Major if still present |
| TV | High | Letter-initial channel placeholders | Major polish |
| Sports | Medium | Empty fixtures common; sparse visual density | Major (content + honesty) |
| Search / Discover | Medium–High | — | Minor |
| Library | Medium–High | — | Minor |
| History | Medium–High | Empty state OK | Minor |
| Downloads | Medium–High | — | Minor |
| Playlists | Medium–High | Legacy retained page comments | Minor cleanup |
| Worlds / Mood | High | — | Minor |
| Artists / Albums | Medium–High | Follow UX dead-end without auth | Major product |
| Premium | Honest, not “sold” | Coming soon — intentional | OK for preview launch |
| Settings | Incomplete | Disabled Appearance/Playback nav | Major |
| Player surfaces | High | — | Keep |

---

## Pages that still feel unfinished

1. **Settings** — disabled sections read as incomplete product  
2. **Sports** — empty Live tab / no fixtures feels pilot-only  
3. **Premium** — correctly non-selling, but not a finished membership product  
4. **Sidebar profile** — “Hidden Listener” cosmetic account  
5. **Music Downloads stub** — contradicts real Downloads  
6. **TV channel art** — initials instead of art on some cards  
7. **Lectures featured cards** — potential title/badge collision (needs current re-capture)  
8. **Dual nav chrome** — top pills + full sidebar can feel overbuilt vs mobile clarity  

---

## Screenshot evidence index

| Capture | Path | Use |
|---------|------|-----|
| Home 1440 | `docs/audits/catalog-runtime-config/route-home-1440x900.png` | Layout only — Recently Added identity **stale** |
| Music 1440 | `…/route-music-1440x900.png` | Layout only — identity **stale** |
| TV 1440 | `…/route-tv-1440x900.png` | Current-looking TV browse |
| Sports 1440 | `…/route-sports-1440x900.png` | Empty fixtures visual |
| Other family routes | same folder | Chrome consistency |

**Recommended next capture pass (not done this audit):** live Electron CDP captures after dirty WIP freeze for Home, Music, Lectures, Player playing, Downloads, Premium, Settings.

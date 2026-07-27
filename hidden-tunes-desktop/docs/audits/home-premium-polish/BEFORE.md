# Home Premium Polish — BEFORE

**HEAD:** `55876cf427f7136a482c6971608456dcb54f122e`  
**Captured:** live Electron against Vite `:5173`

## Metrics summary

| Width | Hero H | Centre W | Player W | Overflow | Giant art | Above fold |
|-------|--------|----------|----------|----------|-----------|------------|
| 1024 | 226 | 550 | 220 | no | no | search, hero, signals, brief, family |
| 1280 | 226 | 722 | 272 | no | no | search, hero, signals, brief, family |
| 1440 | 226 | 852 | 290 | no | no | + Recently Added |
| 1720 | 226 | 1076 | 330 | no | no | + Recently Added |

## Card samples (1440)

- Hero card ~240×220
- Song card ~148×196
- Family card ~206×48

## Issues to polish

1. **Above-fold density at ≤1280:** music rail (Recently Added) does not yet peek — chrome (signals/brief/family) consumes remaining height after hero.
2. **Family shortcuts:** flat text-only tiles; need premium card treatment without oversized art.
3. **Signal pills:** read slightly utilitarian; need warmer contrast and spacing.
4. **Listening brief:** usable but can be more compact when idle.
5. **Section hierarchy:** headings could be clearer vs card titles; rail padding/scroll end spacing.
6. **Card rhythm:** song cards slightly narrow at 1024 (128px); target 138–160px band where possible.
7. **Artist cards:** need circular crop consistency when Creators section appears.
8. **Hover/focus:** add restrained emphasis without layout shift.
9. **Hero:** height OK (226 within 220–260); polish crop, contrast, card chrome — do not enlarge.
10. **Bottom clearance:** padding-bottom 100px present — preserve.

## Architecture status (do not change)

- content-first layout marker present
- no PlayerWorkspace on Home
- no giant art frames
- HomeArt containment intact

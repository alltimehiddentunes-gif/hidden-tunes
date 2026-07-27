# Home Premium Polish — AFTER

**Base architecture:** `55876cf` (content-first Home) — preserved.  
**This commit:** visual hierarchy + responsive polish only.

## Side-by-side

| Topic | Before | After |
|-------|--------|-------|
| Hero height | 226px | 210–236px (≤260 bound) |
| Song card width @1440 | ~148px | ~160px (138–168 band) |
| Family shortcuts | Text-only flat tiles | Accent mark + label/hint hierarchy |
| Signal pills | Flat utilitarian | Ready / rooms accent treatments |
| Listening brief | Single style | Idle vs active states |
| Section headings | Soft | Stronger weight / clearer vs cards |
| Hover/focus | Minimal | Border/background emphasis, no layout shift |
| Bottom padding | 100px | 108px |
| Giant art / workspace hijack | Already fixed | Still fixed |

## Above-the-fold

- **1024:** search, hero, signals, brief, family (2×2) — controlled hero 210px, no overflow
- **1280:** search, hero, signals, brief, family — requirement met (family present)
- **1440 / large:** + Recently Added rail start

## Deliberate visual changes

1. `.music-home--premium` polish layer — does not alter section order or playback routing.
2. Hero art crop tightened (112px / 96px narrow) for more chrome+rail headroom.
3. Family cards use restrained accent marks (not oversized promo art).
4. Rails use 138–168px music cards; artists circular via HomeArt shell.
5. Emotion chips / continue / song cards get focus rings without translateY.

## Architecture unchanged

Home play stays on Home · HomeArt containment · persistent + compact players · mutex / Queue · mobile-parity sections.

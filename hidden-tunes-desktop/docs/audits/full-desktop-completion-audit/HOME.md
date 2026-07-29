# HOME Audit (Desktop)

**Owner:** `src/components/home/MusicHomePage.tsx` via `HomePage` in `App.tsx`  
**Status:** Mostly complete · **78%** · functionally complete but visually incomplete  
**Release ready:** Near, not final

> Mobile Sports / CarPlay issues are **out of scope**. Home scores desktop-only.

## Live behaviour

| Check | Result |
|-------|--------|
| Content-first | Yes (`music-home--content-first`) |
| Play stays on Home | Yes (`context: 'home'`; no PlayerWorkspace hijack) |
| Giant artwork | Contained via HomeArt shells |
| Hero | Carousel from featured / now-playing / catalog |
| Mobile section parity | Strong structural parity via `mobileHomeParity.ts` |
| Family shortcuts | Radio / Podcasts / Audiobooks / Worlds-as-More |
| Right / bottom players | Integrated; play does not replace centre with PlayerWorkspace |
| Emotion chips → Worlds | Navigates Worlds but **query unused** |

## Section order

Search → Hero → Continue → Signal pills → Listening brief → Family shortcuts → Recently Added → Emotion chips → Mood Rooms → Because You Listened → Smart Queue → Creators → Albums Worth → Open Rooms → Genre spotlights → All Songs

## Visual verdict

Home is the **best desktop surface**, but still dense / mobile-parity heavy — **not fully visually complete** as a finished premium desktop composition.

## Defects

- Worlds chip search query ignored
- Uncommitted Home/display polish in dirty tree
- “More” mapped to Worlds (no `/more` hub)

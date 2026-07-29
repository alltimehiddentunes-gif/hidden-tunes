# HOME Audit

**Owner:** `MusicHomePage.tsx`  
**Status:** Mostly ready · ~80% · not fully launch-ready  
**Dirty dependency:** home-reference assets + MusicHomePage + musicGenres + catalogDisplayText staged/modified

## Idle vs active (code + prior runtime)

| Concern | Finding |
|---------|---------|
| Content-first / rails | Present; genres open `genre:` intents |
| Play stays on Home | Yes (`context: 'home'`) |
| Conditional player shell | Supported via surface resolver + provider |
| Reference assets | Staged under `public/home-reference/` — required for premium look; **not on HEAD** |
| Worlds chip query | Still unused by EmotionalWorldsPage |
| Visual | Strongest surface; still dense vs perfect reference match |

## Launch verdict

**Not launch ready** until dirty Home assets/modules are committed and a packaged clean-machine Home pass succeeds. Functionally near for development Electron.

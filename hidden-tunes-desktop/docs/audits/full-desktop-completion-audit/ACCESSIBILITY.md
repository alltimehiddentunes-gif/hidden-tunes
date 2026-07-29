# Accessibility & Interaction Audit

## Strengths

- Widespread `aria-label` / roles on Home, player, TV, search
- `:focus-visible` densest on Home premium + music tabs + player
- `prefers-reduced-motion` handled in multiple CSS blocks + atmosphere
- Keyboard playback shortcuts in provider
- TV surface keyboard handlers

## Gaps / polish

| Item | Severity |
|------|----------|
| Sports aria density low vs Home | Medium |
| Family pages uneven focus rings | Medium |
| No focus-trap library for fullscreen/modals | Medium |
| No automated axe/playwright a11y suite | High (process) |
| Some icon-only / emoji controls thin on labels | Low–Medium |
| 1024 usability depends heavily on content-first CSS; Music capped width feels cramped | Medium |
| High-DPI (observed deviceScaleFactor 1.5 in live Electron) — no dedicated QA matrix | Medium |

## Release blockers vs polish

**Blockers (for public release bar):** missing systematic keyboard pass on Settings disabled controls / Premium dead CTAs can confuse AT users; Favorites label mismatch.

**Polish:** Sports/Radio/TV parity with Home focus styling; reduced-motion audit of all animations; scrollbar/rail consistency.

## Verdict

Accessibility is started and Home-led, not release-complete. Treat as **Should complete before release** for core flows; full a11y certification is post-release unless store requires earlier.

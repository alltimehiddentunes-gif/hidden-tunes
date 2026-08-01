# Phase 7 — Accessibility

## Implemented / preserved

- Hero art and Play controls have explicit `aria-label`s (Play / Pause).
- Album card body: `Open album …`; Play control: `Play album …`.
- Section headers use `aria-labelledby`.
- Icon-only quick-access buttons in active-session mode keep `aria-label` / `title`.
- Focus-visible outlines retained on hero primary/secondary and album play.
- `prefers-reduced-motion` already disables mix enter/exit animations.

## Manual checklist (Electron)

- [ ] Tab through hero → Play → secondary → quick access → first rails
- [ ] Enter/Space activates Play without navigation away from Home
- [ ] Album Play reachable by keyboard without opening details first
- [ ] Expanded player close control labelled and focusable
- [ ] Contrast on hero title/artist against dark panel

## Remaining

Full automated a11y audit deferred to Phase 10; Phase 7 ensures new controls are labelled and keyboard-activatable.
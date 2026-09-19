# Hidden Tunes Desktop — Final Release Clearance

Date: 2026-08-07

## Scope

- Sports: **DEFERRED BY USER DECISION — NOT INCLUDED IN CURRENT RELEASE GATE**.
- Emotional Worlds production: **DEFERRED / BLOCKED BY SHARED BACKEND BUILD ARCHITECTURE**.
- Protected production upload: **PRODUCTION VERIFIED / PERMANENTLY PROTECTED**.

## Phase 1 localization triage

The source audit inspects static JSX text plus user-facing `aria-label`, `aria-description`, `placeholder`, `title`, and `alt` attributes. It does not scan catalog rows, artist/album/station names, user playlist names, developer logs, test fixtures, identifiers, URLs, CSS, or selectors.

| Classification | Count |
|---|---:|
| Original raw candidates | 809 |
| Deferred Sports candidates | 28 |
| Current release candidates | 781 |
| A — user-facing application strings | 594 |
| F — user-facing accessibility strings | 182 |
| G — legitimate false positives | 5 |
| B — catalog/user content | 0 |
| C/D/E — developer, test, or internal | 0 |
| **Actual localization blockers** | **776** |

The five exceptions are the split brand words `Hidden` and `Tunes`, two standalone `&ldquo;` entities, and two standalone `&rdquo;` entities.

Dictionary and ownership contracts remain green: 20/20 locales, 424/424 required keys per locale, zero missing required keys, Arabic RTL enabled, one localization owner, persisted language preference, and no playback restart during locale change.

**Phase 1 result: FAIL.** Real user-facing hardcoded strings are not zero, so the responsive matrix cannot complete the combined Phase 1 gate and Phase 2 cannot be declared complete.

## Packaging evidence already obtained

- TypeScript/Vite production build: PASS.
- Full ESLint: PASS (dependency-only dash.js module warning).
- Windows x64 NSIS build: PASS.
- Installer: `Hidden-Tunes-Desktop-0.0.1-win-x64.exe`.
- Silent per-user install: PASS.
- Installed executable cold launch with isolated profile: PASS.
- Installed clean exit: NOT PROVEN; the first external close request did not close the hidden validation window, and the owned validation process tree was cleaned up without claiming a pass.

The placeholder version remains `0.0.1`; no release-version change or final rebuild was made because Phase 1 did not pass.

## Release decision

**DESKTOP BLOCKED BY NON-SPORTS P1.** Smart TV and Web remain locked until the 776 actual localization blockers are migrated and the remaining responsive, installed Windows, clean-exit, version, and reproducibility gates pass.

## Safety

- Sports was not reopened during final clearance.
- Protected upload was not changed.
- Emotional Worlds was not redeployed.
- No reset, clean, stash, branch switch, or force push was used.

## 2026-08-07 release-policy override and current evidence

This section supersedes the earlier localization-blocked decision above.

- Localization is **PARTIAL — 757 remaining non-Sports strings deferred to P2**: 580 application strings and 177 accessibility strings. It is not a Desktop, Smart TV, or Web blocker. See `DESKTOP_DEFERRED_LOCALIZATION.md`.
- Responsive matrix: PASS at 1024x640, 1280x720, 1366x768, 1440x900, 1920x1080, and 2560x1440 after repairing a 40px title-bar/main-area clipping defect.
- Full ESLint and TypeScript/Vite production build: PASS for version 1.0.0.
- Windows x64 NSIS: PASS via `npm run dist:win-release`.
- Final candidate: `Hidden-Tunes-Desktop-1.0.0-win-x64.exe`.
- Version identity: 1.0.0 in package metadata, lock metadata, About UI, unpacked executable resources, installer resources, and installed executable resources.
- Silent per-user installation: PASS.
- Installed packaged navigation: PASS for Search, Music, Radio, Podcasts, Audiobooks, TV, Motivationals, and Lectures; TV card routing and play-route ownership passed.
- Installed clean exit: PASS; closing the visible main window reduced the exact installed process tree from five processes to zero.
- Playback ownership, audio output, player sidebar/viewport, window controls, playlist picker, Search relevance, catalog identity, TV formats, fullscreen, Downloads, and bounded runtime contracts: PASS.

The only remaining freeze condition is committed-source reproducibility. Sports and Emotional Worlds production remain excluded/deferred, and protected upload remains untouched.

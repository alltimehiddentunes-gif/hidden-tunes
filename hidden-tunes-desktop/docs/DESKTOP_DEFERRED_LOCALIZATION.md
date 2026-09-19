# Desktop Deferred Localization

Status: **P2 — post-freeze completion**  
Release policy date: 2026-08-07

Localization is partially implemented and is not a blocker for the Desktop baseline, Smart TV start, or Web start. This document does not claim localization is complete.

## Current measured backlog

The scoped hardcoded-copy audit currently reports:

- 757 non-Sports user-facing strings remaining
- 580 application-copy strings
- 177 accessibility strings (`aria-label`, `aria-description`, `placeholder`, `title`, or `alt`)
- 5 legitimate exceptions/false positives
- 28 Sports findings, separately deferred and excluded from this release gate

The existing localization contract remains complete for its current dictionary: 424/424 required keys in all 20 locales, with Arabic RTL retained. The backlog represents UI copy that has not yet been migrated into that dictionary.

## Affected surfaces

The largest remaining areas are the application shell and the Music, Player, Playlists, Podcasts, Lectures, TV, Motivationals, Audiobooks, Downloads, Library, History, Search, Radio, account, window-control, and supporting dialog surfaces. Sports is not included in the active migration scope.

## Migration plan

Post-freeze work should proceed in destination batches:

1. Shell, Home, Music, and Search
2. Artists, Albums, Favorites, Library, and Playlists
3. Player, Queue, Radio, Podcasts, and Audiobooks
4. Motivationals, Lectures, TV, Downloads, and History
5. Premium, Settings, Auth, dialogs, and accessibility copy

Each batch must reuse established keys where semantically exact, add genuine translations to all 20 locale dictionaries for new keys, preserve the single React localization owner, and pass TypeScript, ESLint, localization coverage, and locale smoke checks.

## Release treatment

These 757 findings are accepted P2 debt. They may be addressed during release clearance only when an individual string causes a demonstrated P0/P1 usability or accessibility defect. Otherwise they must not delay responsive validation, installed Windows validation, clean-exit proof, version correction, reproducibility, the final NSIS rebuild, or Desktop freeze.

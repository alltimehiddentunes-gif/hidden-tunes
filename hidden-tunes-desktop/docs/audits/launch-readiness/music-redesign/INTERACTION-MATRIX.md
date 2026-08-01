# Phase 7 — Interaction matrix

| Surface | Primary action | Secondary | Stays on Home? | Queue |
| --- | --- | --- | --- | --- |
| Hero Play / art | Play or Pause/Resume current | Open album / Search | Yes (`context: home`) | Catalogue slice / existing |
| Track / release / song card | Play track | — | Yes | Section queue |
| Album card body | Open album details | — | Navigates to album view | Unchanged |
| Album Play | Play album from track 0 | — | Yes | Album tracks, `seedType: album` |
| Artist card | Open artist details | — | Navigates | Unchanged |
| Mood / genre card | Browse search intent | — | Navigates to Search/Worlds | Unchanged |
| Family shortcut | Navigate family | — | Leaves Home intentionally | Unchanged |
| Quick access | Navigate Liked/Recent/Playlists/Albums/Downloads | — | Leaves Home intentionally | Unchanged |

## Explicit product rule

Pressing **Play** never opens album/artist as a side effect. Details open only via intentional navigation (card body / Open album).
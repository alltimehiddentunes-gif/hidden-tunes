# Sports — Status Normalization

Single source: `src/lib/sports/status.ts` → `normalizeSportsFixtureStatus`.

## Rules

| Input | Result |
| ----- | ------ |
| Explicit live family / `live: true` | `live` |
| Upcoming family (`scheduled`, `upcoming`, …) | `upcoming` |
| `completed` / `finished` / finished flag | `completed` |
| Cancelled family | `cancelled` |
| Postponed | `postponed` |
| Unknown / unrecognized code | `unknown` |

## Hard invariants

1. **Passed start time alone does NOT create live.**
2. **Titles containing `LIVE` never affect status** — normalizer does not read `title`.
3. Terminal completed/finished wins over live noise.
4. Probe: finished basketball fixtures may have titles like `LIVE …` while `status.code=finished` → badge **Final** / `completed`, not Live.

## Scores

`formatSportsScore(home, away)`:

- Missing either side → `null` (UI shows `—`)
- **Never invent `0-0` / `0–0`**

## UI

`SportsStatusBadge` maps:

- live → Live
- upcoming → Upcoming
- completed → Final
- postponed / cancelled / unknown → matching labels

# Screenshot Evidence

## Before (user-provided)

```text
Query: Afrobeats
Visible result: 0 matches
```

Interpretation after audit: the summary title uses `formatMatchCount(apkResultCount)`. Because `apkResultCount` lacked `+` operators, the displayed count was songs-only. With music host 503 / zero songs, the UI showed `0 matches` even when other groups (especially Radio) could still return Afrobeats content.

## After (expected)

| Condition | Visible behaviour |
| --- | --- |
| Radio returns N Afrobeats stations, songs still 0 | `N matches` (or N + other groups), Radio cards shown |
| Music API transport failure and no other hits | Error panel + Retry — not genuine empty |
| Music API returns songs | Songs retained even if local scorer is stricter |
| Genuine empty across all sources | `0 matches` / no-matches empty panel only |

Device screenshots after Expo run should be attached by the operator when a simulator/device session is available; network evidence for Radio Afrobeats and music 503 is recorded in `BACKEND-EVIDENCE.md` / `BEFORE-STATE.md`.

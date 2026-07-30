# Root Cause

## Exact mobile defect (proven)

### File: `app/search.tsx`

### Behaviour: `apkResultCount` assignment omitted `+` operators

```ts
const apkResultCount =
  apkSongResults.length
  apkAlbumResults.length
  // ...
  apkTvResults.length;
```

JavaScript ASI makes this equivalent to:

```ts
const apkResultCount = apkSongResults.length;
```

So the visible title `{{count}} matches` was **songs-only**.

### Symptom mapping

```text
Query: Afrobeats
Music API: 503 / empty local songs
Radio: can still return stations
Header: "0 matches"   ← false (songs === 0)
```

This matches the screenshot without requiring an empty catalogue.

## Secondary defects repaired

1. **`buildTrustedBackendSongHits`** (`services/universalSearchService.ts`) dropped API rows when the local scorer returned `null`, converting successful backend hits into an empty group.
2. **Radio deferred search** (`.catch(() => empty)`) converted transport failures into successful empty radio lists.
3. **Error completion race**: `finally` could mark the query complete while error state was still pending via separate yielded setStates.
4. **Query boundary**: `Afrobeat` / hyphenated queries were not canonicalised before `/api/songs?q=`.
5. **No Retry** on the Search error panel.

## Backend contribution

`https://hidden-tunes-api.onrender.com` returned **503** during the audit, so music hits could not be live-proven. That is a host availability issue, not proof the catalogue lacks Afrobeats. Radio on admin still returned Afrobeats stations.

## Verdict

Primary user-visible `0 matches` for Afrobeats with other media available was a **mobile match-count ASI bug**, compounded by error soft-empty paths and (when the API is up) over-strict trusted-hit filtering.

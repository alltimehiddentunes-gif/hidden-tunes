# Root Cause

## Exact mobile defect (proven and repaired in `5f8771e`)

### File: `app/search.tsx`

### Behaviour: `apkResultCount` assignment omitted `+` operators

JavaScript ASI made the visible `{{count}} matches` title equal **songs only**.

```text
Query: Afrobeats
Music API: 503 / empty local songs
Radio: can still return stations
Header before repair: "0 matches"   ← false (songs === 0)
```

That matched the screenshot without requiring an empty catalogue.

## Secondary mobile defects repaired in `5f8771e`

1. **`buildTrustedBackendSongHits`** dropped API rows when the local scorer returned `null`.
2. **Radio deferred search** converted transport failures into successful empty lists.
3. **Error completion race** could clear pending before error state applied.
4. **Query boundary** lacked Afrobeat / hyphen normalisation before `/api/songs?q=`.
5. **Retry label** initially used invalid `errors.retry`; corrected to **`common.retry`** (included in `5f8771e` — do not reopen).

## What is **not** the root cause

| Hypothesis | Verdict |
| --- | --- |
| Missing `admin.hiddentunes.com` public `/api/songs` routes | **Rejected** — admin is not the public music-search authority |
| Anonymous Supabase REST `401` | **Rejected** — unauthenticated probe only; does not prove songs absent |
| Search introduced repo-wide `tsc` script Node typing failures | **Rejected** — baseline script `@types/node` gaps |

## Remaining open layer (mobile → Render chain)

Public music Search remains owned by:

```text
https://hidden-tunes-api.onrender.com/api/songs?q=
```

During post-repair probes, that host returned **503** for Afrobeats / Afrobeat / Burna Boy / Shatta Wale / Black Sherif (including a 90s wake attempt). Until Render returns **200** with a song payload, live music-hit restoration cannot be closed.

### Chain status when host is down

| Step | Status |
| --- | --- |
| Targets Render (not admin) | Proven |
| URL construction + `encodeURIComponent` | Proven correct in code |
| Timeout (12s / 28s cold-start) | Sufficient for wake; irrelevant while hard 503 |
| Abort ≠ zero results | Proven in Search catch (`isAbort` early return) |
| Parser shape support | Ready; no body while 503 |
| Empty failure not cached | Proven (`softEmptyOnError: false` + cache policy) |
| Additional filtering on success | Trusted-hit retention repaired; cannot live-prove until 200 |

## Verdict

Primary user-visible `0 matches` with other media available was a **mobile match-count ASI bug**, compounded by error soft-empty paths. **Live song catalogue availability** remains gated on Render host health — not on admin routes or anonymous Supabase.

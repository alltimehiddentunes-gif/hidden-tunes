# Selected fixture source — pilot recommendation

**Status:** Selected for contracting / dry-run only. **No production import started.**

## Primary selection

| Field | Value |
|-------|-------|
| Provider | **API-Sports / API-Football** (api-sports.io) |
| Role | Licensed football fixture + status + score feed |
| Why | Stable event IDs, fixtures, statuses, scores, update timestamps; commercial API with documented rate limits; does not require video |
| Alternative if terms fail | Sportmonks Football API (same class) |
| Enrichment (optional later) | Official federation schedules (FIBA / ICC / BWF) for non-football coverage |

## Licensing / commercial use

| Item | State |
|------|-------|
| Commercial application redistribution of fixture metadata | **Requires paid plan + written confirmation of app display rights** |
| Current Hidden Tunes account | **Not provisioned for production import** |
| ScoreBat | Present in DB as provider row but kill-switched; highlights-oriented — **not** selected as primary fixture authority |
| YouTube Official / Worldwide Direct HLS | Stream/embed providers — **out of scope** for fixtures pilot |
| IPTV-org / Free-TV / TV Catalog Sports Bridge | **Rejected** as fixture or stream foundation |

## Rate limits (planning assumptions — confirm on signed plan)

| Plan class (typical) | Requests / day | Notes |
|----------------------|---------------:|-------|
| Free / trial | ~100 | Dry-run / mapping only |
| Pro / paid football | 7,500–75,000+ | Enough for 1k–5k fixtures with batched refresh |
| Live scores | Separate quota / shorter TTL | Keep `sports_live_scores_enabled=false` until verified |

Mobile must **not** poll per fixture. Backend batch cadence from Phase 1 plan:

- Far upcoming: 6–24h
- Within 24h: 30–60 min
- Within 60 min: 5–10 min
- Provider-confirmed live: 15–60s batch
- Completed: 1–2 finalization checks, then stop

## Import plan (awaiting explicit approval)

1. Contract + store API key in admin secrets (not mobile).
2. Dry-run 100–500 fixtures (football major leagues window).
3. Deduplicate via `sports_fixture_provider_ids` + canonical key.
4. Map provider status → internal status via `statusAuthority` (no time-only live).
5. Import 1,000–5,000 clean public-eligible rows.
6. Validate `/api/sports/fixtures` pagination + `/api/sports/counts`.
7. Private pilot flags only after gates pass.

## Explicit non-goals for this pilot

- No IPTV-derived event streams
- No mass 50k import
- No `sports_streams_enabled=true`
- No fake scores / clocks

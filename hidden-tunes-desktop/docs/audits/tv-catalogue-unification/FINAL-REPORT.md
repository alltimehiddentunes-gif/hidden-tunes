# Final Report — TV Catalogue Unification

## Workspace proof

See `WORKSPACE-INVENTORY.md`. Key: laptop admin `70f8f95`, mobile `8585f82`, SSD desktop `3b4a91f`, TV-40K `19b0209`, plus archive clones.

## Production authority

`admin.hiddentunes.com` + Supabase `kojcyswxfuikxmqntwye` + laptop `hidden-tunes-admin` as confirmed source.

## Catalogue inventory

One production store: `tv_videos` (17 795). Public eligible 5 908. Playable-but-stale-hidden **10 370**. `tv_sources` empty; one URL per row.

## Playable-but-hidden

| Channel | Found where | Plays flags | Production record | Searchable | Fix |
| --- | --- | ---: | ---: | ---: | --- |
| NHK World* | DB | yes | yes | no | revalidate existing ids |
| Cartoon Network Arabic | DB | yes | yes | no | legality + maybe exclude |
| CNN International | DB | yes | yes | no | rights + revalidate |
| Stale Al Jazeera twins | DB | yes | yes | no | revalidate, no dup import |

## Previously watched

Device AsyncStorage not readable here. Rule: resolve by production **id** before any import. NHK/WildEarth/Al Jazeera already have production rows.

## Search unification

- DB already unified.
- Clients now both target **videos/channels** catalogue path (desktop switched off legacy `/api/tv/search`).
- Laptop admin local parity undeployed; SSD admin search code still stale.

## Source handling

Multiple sources = multiple rows today; no playback fallback. Preserve healthy rows; don’t merge regional variants; future fallback is a separate phase.

## Files changed (this phase)

- Desktop: `tvSearchQuery.ts`, `tvCatalogApi.ts` search path
- Docs under `docs/audits/tv-catalogue-unification/` (backend + mobile/desktop mirrors)
- Backend search files remain from prior local phase (undeployed)

## Mobile / Desktop / Backend validation

See `VALIDATION.md`. Playback owners untouched.

## Production change required

1. Deploy laptop admin search unification.  
2. Approved health revalidation for stale playable rows (no duplicate imports).  
3. Optional SSD admin sync of TV search helpers.

## Safety

reset/clean/stash/branch/commit/push/deploy/prod mutation: **No**  
playback/queue/AfriMeetup: **No**

## Verdict

`Playable Hidden Tunes TV channels are still fragmented across one or more backends, catalogues, routes or deployments.`

Reason: ~10 370 playable rows remain hidden by freshness; production API not yet running unified admin search; SSD admin copy still diverges; multi-source fallback not implemented. Client search contracts are locally aligned to the same catalogue route.

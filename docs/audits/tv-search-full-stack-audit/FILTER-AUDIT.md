# Filter Audit

| Filter | Layer | Intended? | Channels removed | Correct action |
| --- | --- | ---: | ---: | --- |
| status approved / active / playable / reliability / fresh health / HTTPS / platform playable | Backend `applyTvPublicCatalogFilters` | **Yes** — product is playable-public catalogue | All non-eligible DB rows | Keep; document that “catalogue” in UI means eligible public set |
| Mature isolation (env-gated) | Backend | Yes when enabled | Mature unless approved include | Keep |
| `normalizeChannel` / `normalizeTvCatalogVideo` requires id+title | Client | Yes | Malformed rows | Keep |
| `filterPublicTvCatalogVideos` / quality+legacy gate | Mobile client | Yes for safe browse/play | On sampled BBC payload: **0 extra drops** (API already eligible) | Keep; do not weaken into marking unplayable as playable |
| Local quarantine failure store | Mobile | Yes | Repeated local failures | Keep |
| Title-only dedupe | — | **Not used** | — | Prefer id (already) |
| Discover `SEARCH_TV_LIMIT=8` | Mobile Discover | Preview UX | Extra TV hits beyond 8 in Discover only | Keep for Discover; TV destination has full pagination |
| Country name without ISO map | Mobile+Backend | **Defect** | All country-name searches | **Mobile map added**; backend name→code still recommended later |
| Hyphenated titles vs ILIKE | Request string | **Defect** | e.g. `Al-Jazeera` | **Mobile normalize added** |
| `/api/tv/search` title+channel only | Backend search route | Too narrow vs `/videos?q=` | Metadata-only matches | Mobile already avoids this route; backend align later (deploy required) |

## Intended product rule (from architecture)

Public TV list/search is **currently playable eligible channels only**.  
Unavailable/quarantined/unverified rows are excluded server-side. Mobile must not invent playable state for excluded rows.

# TV Complete Catalogue Performance — FINAL REPORT

## Workspace proof

| Check | Value |
| --- | --- |
| Drive / FS | `C:` Windows NTFS |
| Authoritative backend | `C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend\hidden-tunes-admin` |
| Git root | `C:/Users/Wills/Desktop/HiddenTunes` |
| Branch | `feature/radio-worldwide-40k` (unchanged; no reset/stash/rebase/switch) |
| HEAD (pre-commit) | `1b86575a5602510a5ae26719c0dd4d943418047f` |
| Dirty | Yes — unrelated app/API dirty tree preserved; TV-only files staged only if/when approved |
| Protected mobile | `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142` (scroll/perf tweaks only) |
| Production host | `https://admin.hiddentunes.com` |
| Production Supabase | `kojcyswxfuikxmqntwye` |

Authority matched. No mass health, no re-import, no schema mutation.

## Production authority

- Backend remains catalogue authority (`/api/tv/videos`, `/api/tv/channels` re-export, `/api/tv/search`).
- Public browse still requires evidence eligibility + `catalog_eligibility_tier=verified`.
- Legal / DRM / paid / login / blocked / disabled / quarantined / unsupported exclusions unchanged.

## “Alone” trace and final status

| Field | Value |
| --- | --- |
| Exact production ID (primary) | `30bec379-df49-44bd-8f1f-c5986961ad4b` |
| Current title | Alone By History |
| Variant ID | `edc50267-5a27-47d1-b1b0-f9235a33157d` — Alone By History (720p) |
| search_only twin | `337f7a74-6099-430b-86d8-6d5045b02276` — same title, discovery tier (not browse) |
| Country | US (primary) |
| Category | Reality Competition (primary); Documentary (720p) |
| Source host | `d3181anftsyl2u.cloudfront.net` |
| Playback type | `hls_stream` |
| Enabled / quarantined | active, not disabled, not quarantined |
| Health | playable, reliability 100, consecutive_failures 0 |
| Eligibility tier | verified (primary + 720p) |
| Search visibility | Yes (title starts with Alone) |
| Browse visibility | Yes (verified) |
| Can still play | **Yes** — `/api/tv/videos/{id}/play` returns `stream_url` |
| Duplicate created | **No** |

### Why search felt broken

1. Stored title is **Alone By History**, not bare `Alone` — but `q=Alone` already matched it.
2. Production search also returned **Bob Esponja Pantalones Cuadrados** because PostgreSQL `ILIKE '%Alone%'` matches the substring **alone** inside **pantalones**.
3. Local fix: short-token boundary-ish match + synonym `Alone → Alone By History`. After deploy, Alone search returns exactly the two History rows.

Device AsyncStorage history could not be read from this workspace; once a `channelId` is supplied, query `tv_videos` by that exact UUID.

**No new import.** No ID change.

## Sports count discrepancy root cause

| Layer | Count | Notes |
| --- | --- | --- |
| Any sport mention (title/category/tags/genre) | ~719 | Not all browse-eligible |
| Exact `category = Sports` (capital S) | ~169–229 | Matches user “~164” symptom closely |
| Legacy API `%Sports%` + tag Sports | **455** | Current production |
| Canonical membership (local proof) | **576** | sport/Sports/Sport + tags/genre equivalents |
| Claimed “700+” | Not proven for **verified browse** | 719 includes ineligible / title-only noise |

### Root causes of “~164”

1. **Exact capital-`Sports` fragment** (~169 rows) if UI/old filter used equality.
2. **Client scroll stall** (~5 × 32-card pages ≈ 160) — same class of bug as Movies stopping near 262 while API total was 596.
3. Production already returns **455** for `category=Sports` — so the catalogue is larger than 164 on the server today; UI/scroll and/or casing made it look capped.

## Exact eligible Sports count

**576** verified-browse evidence-eligible rows under canonical Sports membership (read-only Supabase dry-run).

Sport / sports / Sports aliases resolve to the same plan and the same 576.

Suspicious non-sport primaries without sport tags/genre: **0** in a 576-row sample.

## Category classification before and after

| Before | After |
| --- | --- |
| Per-route `category.ilike.%Name%` + single tag | Shared `lib/tvCanonicalCategory.ts` |
| `Sports` ≠ full `sport`/`Sport`/`Sports & Outdoors` set | One membership plan for Sports |
| Movies/`movies` casing uneven | Normalized Movies plan |
| Faith / religion / worship fragmented | Mapped to Faith & Worship / Worship Music / Religious equivalents |

No title-keyword browse assignment. No row merges/deletes.

## Route unification

| Route | Status |
| --- | --- |
| `/api/tv/videos` | Uses `buildTvCategoryMembershipOrFilter` **before** `.range` |
| `/api/tv/channels` | Re-exports videos route |
| `/api/tv/search` | Uses shared `buildTvTextSearchOrFilter` via `tvSearch` |
| `/api/tv/categories` | Static catalog labels; occupancy still enforced on open |

## Pagination contract

```text
items → videos
total, limit, page, totalPages, hasMore, nextPage
order: title ASC, id ASC
eligibility → category membership → sort → page
```

Default page 40, max 100. No full-catalogue single response.

## Search completeness

- Hyphen / country-name normalization preserved.
- Short-token boundary fix for Alone-class false positives.
- Synonym: Alone → Alone By History.
- Pagination + stable order unchanged.
- Production still needs deploy for Bob Esponja removal.

## Mobile implementation

Workspace: `HiddenTunes-CLEAN-1.0.142`

- Category load-more empty-hole skip guard **5 → 12**.
- `onEndReachedThreshold` **0.4 → 0.55**; skip while `categoryLoadingMore`.
- Dedup by production ID; preserve `categoryTotal` from API.
- Virtualized list / lazy artwork / single playback owner preserved.
- No stream prefetch; metadata pages only while browsing.

## Desktop implementation

Active desktop already pages `/api/tv/channels` with sentinel `loadMore`. After backend deploy it will receive Sports **576** totals without a second video owner. No desktop rewrite in this phase.

## Tap-to-play identity proof

- Cards carry production UUID.
- Play path: `/api/tv/videos/{id}/play`.
- Alone primary play verified live.
- No title-derived playback identity introduced.

## Performance measurements before and after

| Metric | Before (prod) | After (local/code) |
| --- | --- | --- |
| Sports API total | 455 | 576 (pending deploy) |
| Alone false positives | Bob Esponja present | Excluded locally |
| Page size | ≤100 | unchanged bound |
| Full catalogue fetch | No | No |
| Stream prefetch | No | No |
| News exhaust unique=total | 1137=1137 | unchanged |

Full device CPU/heat/memory matrix requires post-deploy runtime on hardware; architecture constraints for one video owner, bounded pages, and lazy artwork are enforced in code/verifiers.

## Category runtime matrix (production today)

| Category | Backend total (prod) | Notes |
| --- | --- | --- |
| News | 1137 | Exhaust unique=total, 0 dupes |
| Sports | 455 | → 576 after deploy |
| Movies | 596 | Prior audit |
| Entertainment | ~3989 | Prior audit |
| Music TV | ~743 | Prior audit |

Post-deploy: re-run `verify:tv-category-pagination` and exhaust Sports until unique==total.

## Duplicate/missing-row proof

- News exhaust: loaded 1137 unique, duplicates 0, missing 0.
- Sports local membership: 576; no blind import; IDs preserved.
- Alone: existing IDs only.

## Cache behaviour

- Mobile catalog memory cache key = full request URL (includes category, q, page, limit, platform).
- Browse TTL 2 minutes — page 2 cannot collide with page 1 URL.
- After deploy, clients pick up new totals on natural TTL expiry; no global cache kill.

## Files changed

### Backend (`hidden-tunes-admin`)

- `lib/tvCanonicalCategory.ts` **(new)**
- `lib/tvPublicSearchQuery.ts` — short-token match + Alone synonym
- `app/api/tv/videos/route.ts` — canonical membership + `nextPage`
- `scripts/audit-tv-alone-and-sports.ts`
- `scripts/audit-tv-alone-bob-false-positive.ts`
- `scripts/audit-tv-canonical-category-counts.ts`
- `scripts/audit-tv-sports-membership-sample.ts`
- `scripts/verify-tv-alone-trace.ts`
- `scripts/verify-tv-category-authority.ts`
- `scripts/verify-tv-performance-budget.ts`
- `scripts/verify-tv-category-pagination.ts` (Sports floor)
- `package.json` (npm verify scripts)
- `docs/audits/tv-complete-catalogue-performance/FINAL-REPORT.md`

### Mobile (`HiddenTunes-CLEAN-1.0.142`)

- `app/youtube-feed.tsx` — earlier load-more, larger empty-page skip

## Verifier results

| Script | Result |
| --- | --- |
| `npm run verify:tv-alone-trace` | PASS (play OK; Bob still on prod until deploy) |
| `npm run verify:tv-category-authority` | PASS (Sports eligible **576**) |
| `npm run verify:tv-category-pagination` | PASS (News exhaust; Sports prod 455 > 164) |
| `npm run verify:tv-search-playback-unification` | PASS |
| `npm run verify:tv-performance-budget` | PASS |

## Deployment plan

**Stop for approval before commit/push/deploy.**

Proposed TV-only surgical deploy (same pattern as prior VPS SCP):

1. Commit **only** TV files listed above on `feature/radio-worldwide-40k` (do not stage unrelated dirty tree).
2. Push branch.
3. SCP to VPS:
   - `lib/tvCanonicalCategory.ts`
   - `lib/tvPublicSearchQuery.ts`
   - `app/api/tv/videos/route.ts`
4. `npm run build` + `pm2 restart` on admin host.
5. Re-run:
   - `verify:tv-alone-trace` (Bob gone; Alone IDs present)
   - `verify:tv-category-pagination` (Sports total ≥ 500, exhaust unique=total)
   - Spot-check News / Kids / Documentary / Faith & Worship / one country browse
6. Ship mobile rebuild when ready (scroll tweaks).

No schema migration. No catalogue re-import.

## Rollback plan

1. Restore previous `videos/route.ts` + `tvPublicSearchQuery.ts` from safety backup.
2. Remove `tvCanonicalCategory.ts` from runtime require path (or revert commit).
3. Rebuild + pm2 restart.
4. Confirm Sports total returns to prior 455 behaviour and search still serves Alone By History.

## Remaining legitimate exclusions

- `search_only` Alone twin stays discovery-tier (not browse).
- Disabled / quarantined / hard-failed / unpaid DRM / non-HTTPS platform blocks.
- Title-keyword sports guesses not used for browse membership.
- ~719 title-mention sports rows that fail eligibility remain excluded by design.

---

## Status

Local code + DB proofs complete. Production still serves legacy category/search until approved deploy.

**Awaiting approval to commit, push, and surgically deploy the three backend runtime files.**

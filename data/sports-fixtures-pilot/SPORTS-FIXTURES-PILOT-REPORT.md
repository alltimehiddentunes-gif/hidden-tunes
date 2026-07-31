# Hidden Tunes Sports — Live-Fixtures-Only Pilot Report

**Date:** 2026-07-25  
**Mode:** Prepare + validate pilot. **No fixture import. No flag activation. No mass 50k import. No commit/push/deploy of this pilot.**  
**Deliverable root:** `data/sports-fixtures-pilot/`

---

## Executive verdict

**Pilot is NOT ready to enable.** Phase 1 correctness is deployed and verified (stale-live = 0, unsafe broadcasts quarantined, `/api/sports/counts` live). Mobile fixture-only rendering is prepared with streams hard-gated off. **Blockers:** no licensed fixture feed contracted, clean public catalog ≈ 0 usable upcoming fixtures (32 non-quarantined rows are stale test/seed data), capability flags `sports_fixtures_enabled` / `sports_streams_enabled` not yet in production DB, and `sports_fixture_provider_ids` lacks service_role grants.

**Stop state:** awaiting explicit approval for (1) provider contract + test import 100–500, then (2) 1k–5k clean import, then (3) private-pilot flag activation.

---

## 1. Workspace proof

### Mobile (approved CLEAN)

| Field | Value |
|-------|-------|
| Absolute path | `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142` |
| Git top-level | `C:/Users/Wills/Desktop/HiddenTunes-CLEAN-1.0.142` ✅ |
| Branch | `fix/library-content-type-safe` |
| HEAD | `f8cc5fedcc81162185407fad54efb22cbc42fad0` |
| Package | `hidden-tunes-app` |
| Production Sports API | `https://admin.hiddentunes.com` |
| This session changes | Fixture-only pilot prep under Sports paths + this `data/sports-fixtures-pilot/` report |
| Unrelated systems | **Not modified** (Music / Radio / Podcasts / TV / PiP / CarPlay / Android Auto / global playback) |

### Backend (production-serving admin)

| Field | Value |
|-------|-------|
| Path | `C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend\hidden-tunes-admin` |
| Git root | `C:/Users/Wills/Desktop/HiddenTunes` |
| Branch | `feature/radio-worldwide-40k` |
| Local HEAD | `70f8f9549ab5a5eaf6657867545f620ea126fb38` |
| Production API | `https://admin.hiddentunes.com` |
| Production Supabase | `https://kojcyswxfuikxmqntwye.supabase.co` |
| Phase 1 apply report | `…/data/sports-phase1-production-apply/SPORTS-PHASE1-PRODUCTION-APPLY-REPORT.md` |
| This session backend mutate/deploy | **None** |

---

## 2. Correctness deployment state

| Gate | State | Evidence |
|------|-------|----------|
| Apply Sports correctness migration | **Done** | Columns `stream_classification` / `official_evidence` / `watch_external` present; table `sports_fixture_provider_ids` exists (grant gap — see blockers) |
| Deploy status authority + API | **Done** | Scoped VPS deploy `DEPLOY_STAMP=20260725-210838`; `/api/sports/counts` now **200** (was 404) |
| Finalize four stale-live fixtures | **Done** | All four → `completed` / `finished` / `playable=false`; finalized_at `2026-07-25T21:11:06.490Z` |
| Soft-quarantine unsafe broadcasts | **Done** | **770** newly quarantined; **782/782** broadcasts quarantined; **0** open |
| Verify `/api/sports/counts` | **Done** | Public: `enabled:false`, requires pilot/admin for aggregates |
| Video playback unavailable unless verified | **Confirmed** | `playable=true` count **0**; streams flags off; mobile `sports_streams_enabled=false` |

### Production reconfirm (2026-07-25T21:20Z)

Proof: `proof/db-reconfirm.json`

| Metric | Count |
|--------|------:|
| Total fixtures | **791** |
| Live | **0** |
| Stale-live | **0** |
| Scheduled | **10** (all `starts_at` in the past — not usable “upcoming”) |
| Completed | **22** |
| Quarantined fixtures | **759** |
| Upcoming by `starts_at > now` | **0** |
| Playable | **0** |
| Scores | **8** |
| Participants | **32** |
| Broadcasts | **782** quarantined / **0** open |

Former stale-live IDs (finalized):  
`6e268bd9-…`, `58ef42f4-…`, `49657542-…`, `730cba40-…`

---

## 3. Selected fixture source

See `SELECTED-FIXTURE-SOURCE.md`.

| Field | Value |
|-------|-------|
| Selected | **API-Sports / API-Football** (primary); Sportmonks as fallback |
| Licensing | Paid commercial plan + written app-display rights **required before import** |
| Rate limits | Confirm on signed plan; free tier only for dry-run mapping |
| Test import count | **0** (not started — awaiting approval) |
| ScoreBat / YouTube / HLS / IPTV | Not selected as fixture authority |

---

## 4. Catalog / quality metrics (current production)

| Metric | Value |
|--------|------:|
| Clean public-eligible fixture count (non-quarantined) | **32** |
| Usable upcoming (`starts_at > now`) | **0** |
| Live fixture count (provider-confirmed) | **0** |
| Score coverage | **8 / 791** rows |
| Duplicate count | Not fully measured on quarantined dump; pilot import must emit dry-run duplicate report |
| Stale-live count | **0** ✅ |
| Pilot target (1,000–5,000 clean) | **Not met** — gap ≈ 1,000–5,000 |

**Do not treat the 10 “scheduled” seed rows as pilot inventory** — kickoffs are 2026-07-18 → 2026-07-25 and are already past.

---

## 5. API endpoint results

Proof: `proof/endpoint-probe-summary.json` (+ per-route JSON).

| Endpoint | HTTP | Notes |
|----------|-----:|-------|
| `GET /api/sports/home` | 200 | `enabled:false` |
| `GET /api/sports/counts` | 200 | Gate message; pilot/admin for aggregates |
| `GET /api/sports/live` | 200 | Empty while disabled |
| `GET /api/sports/upcoming` | 200 | Empty while disabled |
| `GET /api/sports/fixtures?page=1&limit=5` | 200 | Empty while disabled |
| `GET /api/sports/fixtures?status=live` | 200 | Empty while disabled |
| `GET /api/sports/fixtures?status=upcoming` | 200 | Empty while disabled |
| `GET /api/sports/fixtures?status=completed` | 200 | Empty while disabled |

### Route capability (code review)

`app/api/sports/fixtures/route.ts` + `listSportsFixturesFiltered` support:

- pagination / cursor / bounded `limit` (≤50)
- `status`, `live`, `upcoming`, `finished`
- `sport` / `sportSlug` / `sportId`
- `competition` / `competitionId`
- `date=YYYY-MM-DD` (UTC day window — **user-timezone “today” still a follow-up**)
- deterministic `starts_at` sort
- clean disabled + error responses

`GET /api/sports/fixtures/[id]` exists. Detail works without video.

---

## 6. Feature-flag state

### Production DB (`sports_feature_flags`) — exact

| Key | Enabled |
|-----|---------|
| `sports_enabled` | **false** |
| `sports_live_scores_enabled` | **false** |
| `sports_notifications_enabled` | **false** |
| `sports_mobile_pilot_enabled` | **false** |
| `sports_embedded_playback_enabled` | **false** |
| `sports_native_playback_enabled` | **false** |
| `sports_external_watch_enabled` | **false** |
| `sports_provider_imports_enabled` | **false** |
| ScoreBat* flags | **false** |
| `sports_fixtures_enabled` | **missing** (SQL prepared, not applied) |
| `sports_streams_enabled` | **missing** (SQL prepared, not applied) |

Prepared SQL (not applied):  
`sql/01-sports-pilot-capability-flags.sql`

### Mobile client defaults (`constants/sportsFlags.ts`)

| Key | Default |
|-----|---------|
| `sports_enabled` | false |
| `sports_fixtures_enabled` | **false** (added) |
| `sports_live_scores_enabled` | false |
| `sports_streams_enabled` | **false** (added) |
| `sports_notifications_enabled` | false |
| `sports_mobile_pilot_enabled` / `sports_full_ui_enabled` | false |

**Recommended private-pilot target (only after clean import gates):**

```text
sports_enabled=true
sports_fixtures_enabled=true
sports_mobile_pilot_enabled=true
sports_full_ui_enabled=true
sports_live_scores_enabled=false   # until trusted score feed verified
sports_streams_enabled=false
sports_notifications_enabled=false
```

Master `sports_enabled` remains the public kill switch; streams stay separately disabled.

---

## 7. Mobile rendering status

### Prepared this session

| Change | Purpose |
|--------|---------|
| `sports_fixtures_enabled` / `sports_streams_enabled` client flags | Capability split |
| `getSportsWatchAction` streams gate | No Watch Live / replay / highlights / external watch unless `sports_streams_enabled` |
| Fixture-only labels | `Live score` · `Stream not available` / `Match details` / `Updates unavailable` |
| Empty Live now section | “No confirmed live events right now. Check today’s fixtures below.” |
| Fixture detail hint chip | Same fixture-only messaging when no verified stream |

### Contracts validated

```text
npx tsx scripts/test-sports-frontend.ts     → all assertions passed
npx tsx scripts/test-sports-correctness.ts  → PASS
```

### Already true before this session

- Availability never invents `live_in_app` from kickoff alone
- Detail screen omits empty lineup/stats/stream tabs
- Sports entry remains More → Sports Preview, flag-gated

### Remaining mobile gaps before private enable

- Wire `isSportsFixturesPilotEnabled()` into route gate if fixtures should be toggleable without streams (currently full UI still uses master+mobile+full_ui triad)
- User-timezone “Today” / “Tomorrow” sections need backend date windows aligned to client TZ (API date filter is UTC day)
- Bounded live-list refresh cadence (single request) still needs wiring for private pilot

---

## 8. Whether a new mobile build is required

| Question | Answer |
|----------|--------|
| Did mobile code change? | **Yes** (flags + fixture-only UX + tests) |
| EAS/native build created this session? | **No** |
| Is a new build required to ship the fixture-only safeguards? | **Yes — before any private/public pilot that depends on these client changes** |
| Can Expo Go / local Metro validate without a store build? | Yes, for internal validation only |

---

## 9. Pilot validation gates

| Gate | Status |
|------|--------|
| Stale-live count = 0 | ✅ |
| Unsafe broadcasts quarantined | ✅ |
| No time-only live transition remains (code) | ✅ (Phase 1 `statusAuthority` / playability) |
| ≥ 1,000 clean fixtures imported | ❌ **0** |
| Duplicate rate measured | ❌ pending first dry-run import |
| Timezone mapping correct | ❌ UTC-only date filter; user TZ follow-up |
| All displayed live events provider-confirmed | ✅ vacuously (0 live) |
| Fixture endpoints paginate | ✅ code + disabled probes |
| Mobile shows fixtures with streams disabled | ✅ unit-tested; needs clean data + flags |
| No Watch Live without verified stream | ✅ streams flag + availability |
| Sports does not interfere with other media | ✅ no unrelated edits |
| Flags can immediately disable pilot | ✅ `sports_enabled` master off; capability flags prepared |

---

## 10. Remaining blockers

1. **Contract API-Sports (or Sportmonks)** and store server-side credentials.  
2. **Apply** `sql/01-sports-pilot-capability-flags.sql` (flags stay **false**) + grant `service_role` on `sports_fixture_provider_ids`.  
3. Explicit approval for **test import 100–500**, then **1,000–5,000** clean fixtures.  
4. Prove dedupe, status mapping, timezone, pagination, freshness on real data.  
5. Only then enable private pilot flags (streams remain false).  
6. Live scores flag stays false until feed SLA verified.  
7. Streams remain a separate later phase after legal verification.

---

## 11. Confirmations

- **Streams remain disabled** (`sports_streams_enabled` default false; DB playback flags false; playable=0).  
- **No IPTV reintroduction**; all broadcasts quarantined.  
- **No scheduled→live from kickoff** in deployed authority code.  
- **No fake scores / clocks** invented during Phase 1 or this pilot prep.  
- **No mass 50k import** started.  
- **No commit / push / flag activation / EAS build** performed for this pilot.  
- **No TV PiP / CarPlay / Android Auto / global playback** changes.  
- **Unrelated media systems unmodified.**

---

## 12. Required implementation order — progress

| Step | Status |
|------|--------|
| Deploy Phase 1 correctness | ✅ Done (prior approved apply) |
| Stale-live + broadcast quarantine | ✅ Done |
| Select fixture provider | ✅ Selected (contract pending) |
| Import test batch 100–500 | ⏸ **Stopped — needs approval** |
| Verify dedupe / times / status | ⏸ |
| Import 1,000–5,000 clean | ⏸ |
| Test API pagination + freshness | Partial (disabled probes + code review) |
| Test mobile fixture-only rendering | ✅ Unit tests; needs data for E2E |
| Enable private pilot flags | ⏸ **Not approved** |
| Observe → expand 10k → 50k | ⏸ |
| Add streams when legally verified | ⏸ Separate phase |

---

## Artifacts

| Path | Contents |
|------|----------|
| `SPORTS-FIXTURES-PILOT-REPORT.md` | This report |
| `SELECTED-FIXTURE-SOURCE.md` | Provider choice + licensing notes |
| `sql/01-sports-pilot-capability-flags.sql` | Flag + grant prep (not applied) |
| `proof/endpoint-probe-summary.json` | Live API probes |
| `proof/db-reconfirm.json` | Production DB reconfirm |
| `proof/phase1-after-counts.json` | Phase 1 post-apply snapshot |

---

## Ask for approval (next actions)

Reply explicitly if you want any of:

1. Apply capability-flag SQL (still all **false**) + service_role grant on provider ID map.  
2. Provision API-Sports credentials and run a **dry-run** 100–500 import report (no DB write).  
3. Apply a bounded **100–500** write import after dry-run review.  
4. Proceed toward **1,000–5,000** clean import after test batch passes.

Until then, Sports stays off and streams stay off.

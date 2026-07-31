# Mature TV Import Report

**Verdict:** Dry run completed. **0 channels imported.** No candidate satisfied every required rule (free + legal + public + continuous live + no login/subscription/tokens + verified playable inside Hidden Tunes + Mature (+18)).

---

## Workspace proof

| Field | Value |
|------|--------|
| Workspace | `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142` |
| Git root | `C:/Users/Wills/Desktop/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| HEAD | `8585f821fbd51ef9b876cad6144a5fc9e268660b` |
| Backend import workspace | `C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend\hidden-tunes-admin` |

### `git status --short` (CLEAN mobile workspace)

```
 M components/RemoteMediaControlsBridge.tsx
 M context/PlayerContext.tsx
 M plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift
?? audit/
?? data/sports-fixtures-pilot/
?? scripts/test-ios-call-interruption-gate.ts
?? services/playback/iosAudioInterruptionGate.ts
?? MATURE-TV-IMPORT-REPORT.md
```

No mobile/desktop player, search, catalog, favorites, history, or mature-architecture source files were modified for this task.

---

## Systems confirmed (pre-work)

1. **TV import pipeline** — backend `hidden-tunes-admin`: `probeStreamUrl` / `importVerifiedTvGrowthCandidates` / Wave4 mature registry.
2. **Mature (+18) system** — migration `20260715180000_tv_mature_catalog_isolation.sql`; flag `TV_MATURE_ISOLATION_ENABLED`; Wave4 mature adapters intentionally empty until legal approval.
3. **TV playback validator** — `lib/tvStreamProtocol.ts` + `lib/tvStationHealth.ts`.
4. **Mobile/desktop** — not modified (SoT remains CLEAN mobile + sibling desktop).
5. **No commit / push / deploy.**

---

## Infrastructure blockers found

| Check | Result |
|------|--------|
| `TV_MATURE_ISOLATION_ENABLED` | `false` |
| `tv_videos.is_mature` column on live DB | **Does not exist** (`column tv_videos.is_mature does not exist`) |
| Existing mature TV rows | **0** |
| Wave4 mature approved adapters | **0** |
| Total `tv_videos` rows | 17,710 |

Mature isolation migration is **not applied** on the live catalog DB. Import was refused for that reason as well as candidate quality.

---

## Countries researched (44)

US, CA, GB, FR, DE, NL, BE, LU, CH, AT, IT, ES, PT, CZ, PL, SE, NO, DK, FI, RU, UA, JP, KR, TW, HK, TH, BR, MX, AR, CL, CO, AU, NZ, ZA, IN, CY, SI, AL, RS, HU, GR, RO, MY, ID

---

## Sources researched (15)

| Source | Outcome |
|--------|---------|
| iptv-org NSFW channel metadata (373 rows) | Adult playlists removed; metadata only, no usable official adult HLS index |
| FashionTV / Midnight Secrets | Official PG18 lifestyle channel; CloudyCDN host **dead** (DNS) |
| FashionTV BunnyCDN general feed | Playable official lifestyle HLS; **not confirmed Mature (+18)** |
| TabooVision FAST | Age verification / Smart TV only; no public HLS |
| Pluto TV DE erotic FAST (Emmanuelle / Eros / heisse Nächte) | Legal free FAST; **JWT/tokenized** — excluded |
| Stingray / Plex Pop Adult | Adult-contemporary **music**, not Mature TV |
| Dorcel / Brazzers / Playboy / X-MO / Redlight / EXTASY / Paradise / Hustler / Private / Penthouse | Licensed but **subscription / paid** |
| AdultIPTV.net | Public HLS alive; **rights unverified** — not approved |
| MyCamTV | Public HLS alive; **rights unverified** — not approved |
| Jasmin TV community IP streams | Restream / dead — rejected |
| FR TNT / Molotov / France.tv | No free continuous mature adult linear channel |
| NL Ziggo Erotiek / X-MO | Paid packages |
| JP Paradise TV web | Paid monthly |
| PBS sexual-health | VOD only |
| Wave4 mature registry | Empty by design |

---

## Candidate summary

| Metric | Count |
|--------|------:|
| Candidates discovered / probed | 10 |
| Verified playable **and** legal for Mature import | **0** |
| Rejected | 10 |
| Duplicate vs existing catalog | 0 |
| Proposed import | **0** |
| Imported | **0** |

### Rejection breakdown

| Reason | Count | Examples |
|--------|------:|----------|
| Unverified rights (aggregator / cam) | 5 | AdultIPTV.net ×3, MyCamTV ×2 |
| Fetch failed / dead | 2 | FashionTV Midnight Secrets, Miami TV Gold |
| Not confirmed Mature (+18) | 1 | Fashion TV general BunnyCDN |
| Not mature content | 1 | Stingray Pop Adult (music) |
| Piracy / restream | 1 | Jasmin TV IP stream |

Technically alive HTTPS HLS was observed for AdultIPTV.net and MyCamTV during research probes, but those were **not** imported: they fail the legal / official-broadcaster / `mature_source_approved` gate.

---

## Playback verification summary

- Validator used: existing `probeStreamUrl` (`lib/tvStreamProtocol.ts`) via `scripts/run-mature-tv-deep-import.ts`.
- Accepted for import after legal + playback gates: **0**.
- No `/api/tv/videos/:id/play` verification performed (nothing imported).
- Hidden Tunes TV player / playback ownership untouched.

---

## Controlled import

- Dry run completed first (`04-dry-run-report.json`).
- Import phase run under `--dry-run` → `imported: 0`, `reason: dry_run_flag`.
- Even without dry-run flag, accepted list was empty → no DB inserts.
- Idempotent path unused (nothing to upsert).
- Existing TV catalog IDs preserved; no overwrites.

---

## Files changed

### Backend (research / tooling only)

- `hidden-tunes-backend/hidden-tunes-admin/scripts/run-mature-tv-deep-import.ts` *(new)*
- `hidden-tunes-backend/hidden-tunes-admin/data/mature-tv-deep/00-research-candidates.json`
- `hidden-tunes-backend/hidden-tunes-admin/data/mature-tv-deep/01-existing-mature-audit.json`
- `hidden-tunes-backend/hidden-tunes-admin/data/mature-tv-deep/02-discovery.json`
- `hidden-tunes-backend/hidden-tunes-admin/data/mature-tv-deep/03-verification-results.json`
- `hidden-tunes-backend/hidden-tunes-admin/data/mature-tv-deep/04-dry-run-report.json`
- `hidden-tunes-backend/hidden-tunes-admin/data/mature-tv-deep/05-import-report.json`
- `hidden-tunes-backend/hidden-tunes-admin/data/mature-tv-deep/99-final-report.json`

### CLEAN workspace

- `MATURE-TV-IMPORT-REPORT.md` *(this file)*

### Not changed

- TV player, search, playback ownership, categories, favorites, history
- Existing TV catalog rows
- Mature isolation schema / Wave4 mature architecture
- Mobile / desktop app source

---

## Database operations

| Operation | Result |
|-----------|--------|
| SELECT audit `tv_videos` | OK (17,710 rows) |
| SELECT mature rows | Failed — `is_mature` column missing |
| INSERT / UPDATE mature channels | **None** |

---

## Rollback information

- **Nothing to roll back** — zero mature TV rows imported.
- Future rollback (if imports later succeed): deactivate by `source_id` prefix `mature-tv-%` or clear `is_mature` / `mature_source_approved` after migration is applied.
- Migration not applied; no mature columns to drop from this run.

---

## Safety confirmations

- No commit
- No push
- No deploy
- No mobile code changed for this task
- No desktop code changed
- No existing TV platform behavior changed

---

## Wave 2 continuation (deepened search)

Second pass completed. Additional sources probed; **import count remains 0**.

| Additional source | Result |
|-------------------|--------|
| FashionTV Midnight Secrets / secrets.ftv.com / Samsung Wurl | Live pages 500/empty; CDN + Wurl hosts dead |
| Visit-X TV | Historical HLS 404; paid-credit cam platform |
| Babestation 3QSDN | 404; Freeview/Sky/Virgin or paid web |
| AST.TV Cyprus | Stream paths 404; domain repurposed |
| Sexy Hot Brasil | Pay-TV / promo VOD only |
| LEO TV / EXTASY (CZ) | Licensed but subscription / tokenized |
| Stripchat / LiveJasmin | Scrambled or non-public HLS |
| iptv-org NSFW×streams residual (4) | False flags (Allegro/Ananda ID) or dead Canal Brasil IP |
| AdultIPTV / RedTraffic | Still alive technically; rights still unverified — not approved |
| FAST aggregators | Tokenized or no free public mature HLS |

Wave 2 artifact: `hidden-tunes-admin/data/mature-tv-deep/10-wave2-research.json`

---

## Next steps (if product wants mature TV inventory later)

1. Apply `20260715180000_tv_mature_catalog_isolation.sql` and enable `TV_MATURE_ISOLATION_ENABLED=true`.
2. Legal-review and approve each mature source into `wave4MatureSources.ts` (`approvalStatus === "approved"`).
3. Prefer official free continuous HLS from licensed broadcasters (e.g. recover FashionTV Midnight Secrets official CDN, or licensed FAST partners that publish stable public HTTPS HLS without tokens).
4. Re-run:  
   `npx tsx scripts/run-mature-tv-deep-import.ts --phase=all`  
   from `hidden-tunes-admin` (remove `--dry-run` only after accepted > 0).

---

## Completion criteria status

| Requirement | Status |
|-------------|--------|
| Free | N/A — none imported |
| Legal | Enforced — unverified/piracy/subscription rejected |
| Publicly accessible | Enforced |
| No login / subscription | Enforced |
| Not YouTube | Enforced |
| Verified play inside Hidden Tunes | No imports to verify |
| Mature (+18) classification | Isolation not live on DB; no rows written |
| Existing TV platform unaffected | **Yes** |

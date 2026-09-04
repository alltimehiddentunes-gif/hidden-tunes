# Hidden Tunes Rights Control Center

Phase 4A implements the rights control plane without activating production enforcement. It does not alter source catalog rows, R2 objects, playback, navigation, iOS code, deployment configuration, or Apple-facing behavior.

## Safety gates

Two independent, server-only environment flags protect the system:

- `RIGHTS_ENFORCEMENT_ENABLED=true` allows the shared eligibility evaluator to deny public content after route integration. The default is OFF.
- `RIGHTS_BULK_EXECUTION_ENABLED=true` allows execution and rollback jobs. The default is OFF.

Only the exact lowercase value `true` enables either gate. Client input cannot change them. Phase 4A exposes dry runs in Admin but deliberately exposes no execution button. `RIGHTS_INDEX_WRITE_ENABLED=true` plus the explicit `--execute` CLI argument is separately required for catalog projection backfill.

Emergency disable is immediate: set both rights flags to anything other than exact `true`, restart the server/worker, and verify the Overview page displays OFF. This does not delete or restore catalog or media data.

## Status and precedence

Rights states are `GREEN`, `AMBER`, `RED`, and `UNKNOWN`. Enforcement OFF preserves existing runtime behavior regardless of state. Enforcement ON fails closed for AMBER, RED, UNKNOWN, missing policy, conflict, future policy, and expired policy.

The deterministic order is:

1. legal/DMCA block;
2. content override;
3. import batch;
4. source/uploader/catalog;
5. provider/network;
6. content-type/global policy;
7. no decision = UNKNOWN.

A lower-level allow cannot defeat a legal block. Equally specific contradictory policies return a conflict and remain unavailable. Policy versions are additive; activation and retirement are audited.

## Catalog projection and filtering

`rights_catalog_items` is an indexed rights/search projection. It never replaces source tables. Its initial status is UNKNOWN, and the foundation migration performs no backfill.

The server accepts only a versioned, allowlisted filter AST. Fields include content type, provider, status, uploader, import batch, ingestion date, platform, territory, evidence, expiry, stream type, hostname, source availability, and text search. Arbitrary SQL and arbitrary field names are rejected. Filters compose with AND. Result pages are bounded to 250 records; the Admin default is 100.

The ledger indexer reads the Phase 3 record-level CSV in a stream. Dry mode is default. It verifies exactly 1,065,943 rows, zero skipped rows, and unique `content_type:content_id` keys. Even an executed backfill writes only the rights projection and defaults records to UNKNOWN; it cannot affect production eligibility while enforcement is off.

## Select all filtered

The browser never sends or receives a million IDs. `POST /api/admin/rights/filters/preview` validates and normalizes the filter, records its SHA-256, exact count, catalog watermark, policy revision, actor, and expiry, and returns a sample.

The worker materializes every matching server-side ID into `rights_bulk_job_targets` before an action starts. Unique job/item constraints make retries safe. Because membership is frozen before filtered fields change, an operation cannot shrink its own remaining result set. New records after the snapshot are not included.

## Dry runs and jobs

Dry runs use the same immutable targets and action payload as execution. They report matching, would-change, unchanged, conflict, item-override, provider/batch inheritance, expiry, higher-priority block, and current/proposed platform counts. They write job, target, progress, and sanitized audit metadata only; they never write policy or eligibility.

Job states are `QUEUED`, `PREPARING_TARGETS`, `DRY_RUNNING`, `RUNNING`, `COMPLETED`, `PARTIAL`, `FAILED`, `CANCELLED`, plus rollback states. Workers claim work with `FOR UPDATE SKIP LOCKED`, process 100–2,000 records per batch, persist progress, and support cooperative cancellation. `(actor_id, idempotency_key)` and action hashes make retries deterministic.

Execution requires owner permission, the execution gate, a completed unexpired dry run, an unchanged action hash, and the same immutable snapshot. Provider-level policies should be used instead of thousands of item overrides whenever the scope is genuinely provider-wide.

## Changesets and rollback

Every execution creates one changeset and bounded per-record before/after entries. Rollback is itself previewed, confirmed, queued, and audited. The worker compares expected item versions; later changes become explicit conflicts and are not overwritten. Rollback restores control-plane metadata only. It never deletes or recreates source catalog rows, media, artwork, playlists, favorites, history, or R2 objects.

The development migration rollback refuses to drop the foundation if catalog, job, changeset, license, or evidence rows exist.

## Providers, licenses, evidence, and expiry

The metadata-only provider registry includes Mureka, DJcity, LibriVox, Internet Archive, IPTV-org, Radio Browser, and Podcast Index. No seed policy is created or activated. Mureka metadata records UID `118869219999745` and owner `Lotsu Emmanuel`.

One `rights_licenses` record can have many typed scopes covering providers, uploaders, catalogs, batches, content types, owners/networks, territories, platforms, content dates, and granted capabilities. `rights_evidence` stores evidence type, private object key, SHA-256, dates, territories, platforms, and verification state. APIs never return private object keys or signed URLs in list responses.

Expiry windows are 90, 30, and 7 days plus expired. Once enforcement is later integrated and enabled, expired grants fail closed.

## Admin workflow

Desktop Admin includes:

- Overview
- Content
- Providers
- Licenses
- Evidence
- Expiring
- Review Queue
- Bulk Jobs
- Audit Log

The Content console combines server filters, shows exact counts, creates immutable select-all snapshots, and queues dry runs. High-impact execution is intentionally absent during Phase 4A. Rights read access is owner/admin/moderator; execution and rollback are owner-only.

The proposed review groups are visible but unassigned. Music provenance is based on the owner's final authoritative declaration dated 2026-09-04:

- MUREKA ORIGINAL: 1,245 → proposed GREEN / iOS ON
- DJCITY: 3,498 → proposed RED / iOS OFF
- UNKNOWN MUSIC: 0
- IPTV DMCA: 2 → proposed RED / iOS OFF

For this catalog only, the owner defines the original 1,245 tracks ingested on or before 24 July 2026 as Mureka and every remaining music record as DJcity. This supersedes the earlier evidentiary 1,225/2,273 split. The classification prepares reviewable provider groups only; it does not attach a rights status or change availability.

## Public enforcement integration

`lib/rights/publicEligibility.ts` defines one server contract for Home, Explore, Search, details, artists, albums, recommendations, Emotional Worlds, Mood Rooms, playlists, favorites, history, queue, direct IDs, deep links, playback resolution, TV, radio, podcasts, audiobooks, lectures, and motivationals.

The contract is tested with enforcement OFF and ON. Per the approved architecture and zero-regression boundary, Phase 4A does not modify those existing public routes. Integrating the contract into public response and playback paths remains a separately authorized, one-content-type/one-platform enforcement phase.

## Cache invalidation strategy

When enforcement is later enabled, a policy revision must be included in API/search/recommendation cache keys. Activating or retiring a policy increments the revision and invalidates affected effective-state rows. Playback URL resolution must evaluate eligibility after cache lookup and immediately before returning a URL. Clients should receive stable unavailable responses, not signed or source URLs. Cached client entities may remain displayed only as unavailable placeholders; they must not resolve playback.

## Validation commands

Run from `hidden-tunes-backend/hidden-tunes-admin`:

```powershell
npx.cmd tsc -p tsconfig.rights.json --noEmit
npx.cmd eslint lib/rights lib/adminPermissions.ts components/AdminShell.tsx app/admin/rights app/api/admin/rights scripts/run-rights-catalog-index.ts scripts/run-rights-job-worker.ts scripts/test-rights-*.ts
npx.cmd tsx scripts/test-rights-policy-engine.ts
npx.cmd tsx scripts/test-rights-bulk-engine.ts
npx.cmd tsx scripts/test-rights-scale.ts
npx.cmd tsx scripts/test-rights-workflows.ts
npx.cmd tsx scripts/test-rights-enforcement-surfaces.ts
npx.cmd tsx scripts/test-rights-migration-static.ts
npx.cmd tsx scripts/run-rights-catalog-index.ts --input=<master-ledger.csv>
```

Do not run an indexer or worker with `--execute` against production without separate owner authorization, a reviewed exact dry run, and passing full regression checks.

# Hidden Tunes — Motivationals Expansion Manual Runbook

Production target commit: **`797a2d6`**

Foundation commit: **`a124617`**

VPS project path:

```text
/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
```

This runbook is for **manual execution only**. The automated migration runner cannot apply DDL on production because `DATABASE_URL`, `SUPABASE_DB_URL`, and `SUPABASE_ACCESS_TOKEN` are not available on the VPS.

---

## Important definitions

| Term | Meaning |
|------|---------|
| **Healthy public** | `approved` + `active` + `verified` + `playable` + `content_classification = accept` + reliability ≥ 60 |
| **Pending** | Imported but not promoted — **does not count** toward 200k |
| **Discovery** | Archive search — **does not count** toward 200k |
| **Promotion** | Separate manual step after review |

Only **active healthy public verified-playable** items count toward the 200,000 milestone.

---

## A. Supabase SQL migration

1. Open the **production** Supabase project dashboard.
2. Go to **SQL Editor** → **New query**.
3. Paste the full contents of:

   ```text
   deployment/manual/motivation-expansion-quality-production.sql
   ```

4. Run the query. Confirm it completes without error.
5. Open a new query and paste:

   ```text
   deployment/manual/motivation-expansion-quality-verify.sql
   ```

6. Run each verification section and confirm:
   - **8 quality columns** exist on `public.motivation_items`
   - **3 indexes** exist
   - Status counts look reasonable
   - `healthy_public_total` reflects current approved catalog
   - Watchlist query returns items needing manual review

**What the migration does:**

- Adds quality columns with safe defaults (`hold`, `unchecked`, `none`)
- Backfills `content_classification = 'accept'` only for rows already `approved` + `active` + `verified` + `playable`
- Does **not** promote pending rows
- Does **not** delete or reject records
- Safe to rerun (idempotent)

---

## B. VPS deployment

SSH to the VPS, then:

```bash
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
bash deployment/manual/deploy-motivation-expansion.sh
```

The script will:

- Confirm directory and git HEAD (`797a2d6`)
- Run `npm ci`
- Load `.env.production` (values not printed)
- Run all Motivationals tests + build
- Restart `hidden-tunes-admin` via PM2

**Do not** run `npm run motivation:apply-quality-migration` on the VPS — use Supabase SQL Editor instead.

**Do not** touch:

- `manual-backups/`
- `data/motivation-expansion-checkpoints/`
- Git stashes (unrelated Lecture work)
- `lib/lectureSeedIngest.ts`

---

## C. Production endpoint verification

```bash
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
bash deployment/manual/verify-motivation-production.sh
```

Checks:

| Endpoint | Expected |
|----------|----------|
| `GET /api/motivation/items` | 200, JSON, metadata-only |
| `GET /api/motivation/categories` | 200, JSON |
| `GET /api/motivation/search?q=speech` | 200 (after migration) |
| `GET /api/motivation/category/speeches` | 200 (after migration) |

Fails if browse/search/category/detail responses contain playable URL fields.

---

## D. Existing public catalog audit

```bash
bash deployment/manual/audit-existing-public-motivationals.sh
```

Read-only. Highlights classifier decisions and watchlist titles:

- MIT15.969F04
- MIT How To Speak, IAP 2018
- MIT Cryptocurrency Engineering
- The Light Of Faith
- Mindwarz Videos

To demote misclassified **public** items after manual review, use:

```text
deployment/manual/motivation-public-demotion-template.sql
```

---

## E. Next dry expansion batches

```bash
APPLY_WRITES=false bash deployment/manual/run-next-motivation-batches.sh
```

Runs dry batches for: `leadership`, `mindset`, `speeches`, `commencement`.

Reports saved to:

```text
data/motivation-expansion-batch-reports/<family>-<timestamp>-dry.json
```

Each dry run must show:

- `public_promotions = 0`
- `errors = []`
- Proposed inserts = media-verified + rights-passed only

---

## F. Controlled pending writes

**Only after** reviewing dry-run reports:

```bash
APPLY_WRITES=true bash deployment/manual/run-next-motivation-batches.sh
```

Optional overrides:

```bash
LIMIT=100 BATCH_NUMBER=20 APPLY_WRITES=true bash deployment/manual/run-next-motivation-batches.sh
```

Writes are **pending only**. `public_promotions` must remain 0.

---

## G. Promotion review

```bash
bash deployment/manual/review-pending-motivationals.sh
```

Saves output to:

```text
data/motivation-promotion-review-<timestamp>.json
```

Review manually. Do **not** auto-apply.

---

## H. Never run blindly

These commands change public catalog state and require explicit human review:

```bash
npm run motivation:promotion:apply
npm run motivation:batch0:review:apply
npm run motivation:batch0
```

---

## Milestone tracking

Check healthy public count in Supabase:

```sql
select count(*) as healthy_public_total
from public.motivation_items
where status = 'approved'
  and is_active = true
  and is_verified = true
  and playback_status = 'playable'
  and is_mature = false
  and content_classification = 'accept'
  and reliability_score >= 60;
```

Current baseline (pre-demotion): **9 healthy public**, **7 pending**, gap to 200k: **199,991**.

---

## File index

| File | Purpose |
|------|---------|
| `motivation-expansion-quality-production.sql` | Manual DDL migration |
| `motivation-expansion-quality-verify.sql` | Post-migration verification |
| `deploy-motivation-expansion.sh` | VPS deploy + test + build + PM2 |
| `verify-motivation-production.sh` | Production API checks |
| `audit-existing-public-motivationals.sh` | Read-only classifier audit |
| `motivation-public-demotion-template.sql` | Manual demotion template |
| `run-next-motivation-batches.sh` | Dry/write expansion batches |
| `review-pending-motivationals.sh` | Read-only promotion review |

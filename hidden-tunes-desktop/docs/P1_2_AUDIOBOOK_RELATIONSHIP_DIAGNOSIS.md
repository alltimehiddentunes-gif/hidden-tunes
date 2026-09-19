# P1-2 — Audiobook Relationship Diagnosis

Date: 2026-08-07

## Verdict

BLOCKED — PRODUCTION DATA REPAIR AUTHORIZATION REQUIRED.

No production rows were inserted, updated, relinked, or deleted.

## 20-book production audit

Evidence: `hidden-tunes-backend/hidden-tunes-admin/reports/audiobook-relationship-audit.json`

- Books audited: 20.
- Books with playable chapters: 19.
- False-zero books: 1.
- Additional partial file defect: 1 book had one chapter without playable file resolution.

## Exact false-zero

- Book ID: `fe0dd05b-caf5-4214-8910-34456c182e41`
- Title: `Faerie Queene Book 4`
- Canonical source: `librivox:book:3251`
- Declared `chapter_count`: 13
- Related `audiobook_chapters` rows: 0
- Resolved chapters: 0
- Playable chapters: 0

## Relationship trace

The public detail resolver correctly queries:

`audiobook_chapters.audiobook_id = audiobooks.id`

The canonical production book row is approved, active, and marked playable, but no chapter rows reference its UUID. Adjacent exact-source Faerie Queene books have complete relationships:

- LibriVox 310 / Book 1: 13 rows.
- LibriVox 3250 / Book 5: 14 rows.
- LibriVox 3249 / Books 6 & 7: 16 rows.
- LibriVox 3251 / Book 4: 0 rows.

This rules out slug parsing, title normalization, pagination, and Desktop ID translation. The defect is an incomplete production ingest: aggregate metadata was persisted without its exact-source chapter/file relationships.

## Required repair

Re-ingest or backfill the exact canonical source `librivox:book:3251`, preserving the existing book UUID and upserting chapters/files by exact source keys. Then reconcile `chapter_count` from relationship rows and rerun the 20-book plus five-book Electron playback matrix.

That operation mutates production metadata and therefore was not performed without explicit authorization.

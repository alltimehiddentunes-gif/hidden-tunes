# Hidden Tunes — Audiobooks Multi-Source Audit

**Generated:** 2026-08-01T21:18:23Z  
**Mode:** Audit + provider matrix + adapter design + bounded dry-run  
**Production writes:** none  
**Commit / push / deploy / OTA / build:** none

---

## 1. Workspace proof

### Production API
| Item | Value |
|------|--------|
| Public admin | `https://admin.hiddentunes.com` |
| Origin | VPS `148.230.109.215` (Cloudflare → nginx → PM2 `hidden-tunes-admin`) |
| Remote path | `/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin` |
| Not Vercel | Confirmed (no live Vercel production for this hostname) |

### Local Active backend (production counterpart)
| Item | Value |
|------|--------|
| Absolute path | `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-backend\hidden-tunes-admin` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-Desktop` |
| Branch | `desktop/integrate-home-music-split` |
| HEAD | `927c4d11fa50fdfcc61b4b87d0048e40ab91fe71` |
| Dirty | Untracked audit script/artifacts only (no commit) |

### Production Supabase (proved)
| Item | Value |
|------|--------|
| Project ref | `kojcyswxfuikxmqntwye` |
| URL | `https://kojcyswxfuikxmqntwye.supabase.co` |
| Proof | Public API audiobook id `fe0dd05b-…` resolves in this DB with matching title/source |

### Mobile
| Item | Value |
|------|--------|
| Git root | `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| HEAD | `95b89f53626b383f21c81b2e89ecf003ac0ac2ec` |
| Metro 8081 | Intended; status probe timed out during this run |

Artifacts: `data/audiobooks-multisource/`  
Dry-run script: `scripts/run-audiobooks-multisource-audit-dryrun.ts`

---

## 2. Current source counts (production)

> Last known (~235 books / ~5,401 chapters) is **stale**. Live DB is much larger.

| Metric | Count |
|--------|------:|
| Total audiobooks | **2598** |
| Total chapters | **58464** |
| Total audio files | **58459** |
| Playable audiobooks (`active` + `approved` + `playback_status=playable`) | **2597** |
| Playable/active chapters (approx) | **58464** |
| Public general lane (`is_mature=false`, same gates) | **1197** |
| Public API `GET /api/audiobooks` `pagination.total` | **1197** |
| Missing covers | **0** |
| Incomplete books (`is_complete` / completeness fields absent in prod schema) | **0** (columns not present) |
| Single-chapter books | **416** |
| Invalid chapter ordering (gap/dup sequence) | **22** |
| Non-playable books | **1** |
| Duplicate title+author groups | **31** |
| Duplicate chapter-number pairs | **453** |

### Source / provider distribution

| `source_type` | Count |
|---------------|------:|
| `internet_archive` | **1734** |
| `librivox` | **841** |
| `manual` | **23** |

| Publisher (top) | Count |
|-----------------|------:|
| Internet Archive | 1568 |
| LibriVox | 864 |
| Internet Archive / LibriVox | 166 |

### Language (top)
English/eng dominate (~2341 combined). Also spa, German, fre, Multilingual, ita, French, Spanish, pol, Chinese, …

### Category (top)
See `01-catalog-audit.json` → `distributions.categoryTop20`.

### Licence classification (heuristic on `rights` / `license_*`)
Production schema has `rights` but **not** dedicated `license_type` / `license_url` / `rights_evidence` / `recording_type` / `narration_type` columns on live `audiobooks` (migrations exist in repo that are **not fully applied**). Heuristic over `rights` + publisher:

| Class | Notes |
|-------|--------|
| public_domain_or_librivox | LibriVox + many IA PD/CC marks via importer filters |
| unknown | Sparse/empty `rights` on some rows |
| creative_commons | When rights text mentions CC |

Exact licence tallies: `01-catalog-audit.json` → `distributions.licence`.

### Mature vs general
Roughly half the catalog is mature-lane (`is_mature=true` ≈ 1400). General browse shows **1197**. This is a **lane split**, not a LibriVox-only filter.

---

## 3. Exact reason non–Project Gutenberg / Commons sources appear absent

### Proven causes

1. **Original seed pipeline is LibriVox-only**  
   `lib/audiobookSeedIngest.ts` hardcodes LibriVox API + `source_type: "librivox"`. npm alias `audiobooks:import:librivox`.

2. **Adapter registry only wires Internet Archive families**  
   `lib/audiobookSources/adapterRegistry.ts` builds adapters solely from `INTERNET_ARCHIVE_AUDIOBOOK_QUERIES`.  
   **No** Project Gutenberg human adapter.  
   **No** Project Gutenberg Open Audiobook adapter.  
   **No** Wikimedia Commons adapter.

3. **Schema repair historically defaulted empty `source_type` → `librivox`**  
   Migration `20260706123000_audiobook_catalog_production_schema_repair.sql`.

4. **Public API does *not* filter LibriVox**  
   `lib/audiobookCatalog.ts` gates on `status` / `is_active` / `playback_status` / `is_mature`. Provider is omitted from public select list, so the app cannot show source diversity even when IA rows exist.

5. **IA expansion heavily overlaps LibriVox**  
   First IA family is `internet_archive:librivoxaudio`. Many “Internet Archive” rows are still LibriVox recordings mirrored on IA.

6. **`audiobook_source_registry` table is not in production**  
   Live PostgREST returns PGRST205 (missing table). Multi-source checkpoint registry from later migrations is not deployed.

### Rejected hypotheses
| Hypothesis | Verdict |
|------------|---------|
| Public query hard-filters LibriVox only | **Rejected** |
| Mobile client filters LibriVox only | **Rejected** (no provider filter) |
| Deduper rejects all non-LibriVox | **Rejected** (1734 `internet_archive` rows exist) |
| Cover logic requires LibriVox IDs for all rows | **Rejected** (IA uses archive.org image service; 0 missing covers) |

### Perception vs reality
The catalog is **not** “almost exclusively LibriVox” in the database (**841** LibriVox + **1734** IA + **23** manual). It *is* **LibriVox-shaped**:
- branding/publisher often LibriVox or IA-LibriVox
- no Gutenberg / Commons providers
- mobile UI does not surface provider / narration type
- general lane is ~1.2k of ~2.6k books

---

## 4. Providers evaluated

1. LibriVox (existing)
2. Internet Archive open-licence audiobook families (existing adapters; partially imported)
3. Project Gutenberg human-read audiobooks
4. Project Gutenberg Open Audiobook Collection (Microsoft/MIT synthetic)
5. Wikimedia Commons audiobook / spoken-work audio
6. Future: university / government / national-library / author CC feeds (case-by-case)

---

## 5. Legal / licence matrix

| Provider | Content type | Approx inventory | Human/AI | Licence | Commercial display | Audio redistribution | Attribution | Territory limits | API/feed | Verdict |
| -------- | ------------ | --------------------: | -------- | ------- | ------------------ | -------------------- | ----------- | ---------------- | -------- | ------- |
| LibriVox | Volunteer chapter MP3 | Large (10k+ projects; HT has 841) | Human volunteer | Public domain dedication of recordings (US); text PD | Generally OK for free apps with attribution | Yes (PD) | Project + readers | US-centric PD assumptions | `librivox.org` API + IA `librivoxaudio` | **Approve** (existing) |
| Internet Archive (non-LV open) | Mixed spoken audio | Large; HT has 1734 IA rows (mixed quality/lanes) | Mixed | Per-item CC/PD via `licenseurl` filter | Only when licence allows | Only open-licence items | Creator + IA | Per item | Advanced Search + metadata API | **Conditional** (already wired; tighten quality/classification) |
| PG human-read | Human audiobook ebooks | **~576–662** category ids observed (**576** on browse page) | Human | Gutenberg terms; underlying text US PD | Free display OK; follow PG trademark/terms | Direct file links typically OK for PD audio | “Project Gutenberg” + ebook page | **US PD ≠ worldwide** — store `rights_territory` | Browse category `/browse/categories/1` + ebook pages / files | **Approve with territory metadata** |
| PG Open Audiobook Collection | Neural TTS of PD texts | **~5,000** claimed (MIT/Microsoft/PG) | **Synthetic** | Open / PD-oriented; verify per mirror | OK if labelled synthetic; do not call “human narrated” | Prefer official mirrors (Azure collection site, IA, PG distribution) | PG + Microsoft/MIT research attribution | US PD text; confirm audio terms per host | Collection site `aka.ms/audiobook` / Azure blob landing; IA search; podcast mirrors | **Conditional — synthetic lane** |
| Wikimedia Commons | Spoken literature / audiobooks / AI files | Search `audiobook` ns6 ≈ **3545** hits (not all usable books) | Mixed (many AI single files) | **Per-file** CC/PD via extmetadata | Only if licence allows commercial use | Per-file | Artist/uploader/licence URL mandatory | Per-file | MediaWiki API | **Conditional — per-file gate** |
| Commercial / DRM / trials | N/A | N/A | N/A | Unclear / proprietary | No | No | N/A | N/A | N/A | **Reject** |

---

## 6. Estimated additional inventory

| Source | Gross | After chapter-map + dedupe + playable + rights | Priority |
|--------|------:|-----------------------------------------------:|----------|
| PG human-read | ~600–700 | **~400–650** net new editions | P0 |
| PG Open (synthetic) | ~5000 | **~1500–4000** staged (quality batches; label synthetic) | P2 |
| Wikimedia Commons | ~3500 file hits | **~200–1500** after grouping into books + licence + playable (`audio/*` + ogg) | P1 (human) / P2 (AI) |
| IA residual non-LV | Unknown remaining | Moderate; adapters exist | Ongoing |

**Realistic quality-first expansion:** low thousands of *additional* titles over controlled batches — not a single dump. Do not inflate with mature/erotica IA noise already present in the mature lane.

---

## 7. Human versus synthetic counts

| Bucket | Production today | Dry-run samples |
|--------|------------------|---------------|
| Human (LibriVox / volunteer) | Dominant in general classics branding | PG human: **100/100** sampled playable |
| Synthetic labelled | Not modelled (`narration_type` absent in prod) | PG Open sample playable **45**; Commons AI files playable **2** in first 50 (ogg false-rejects) |
| Unknown | Most IA non-LV | Commons non-AI files often `unknown_inspect_per_file` |

**Requirement:** add `narration_type` enum (`human_professional` \| `human_volunteer` \| `human_author` \| `synthetic` \| `unknown`). Never present synthetic as professional/human studio narration.

---

## 8. Adapter architecture

Reuse existing contract in `lib/audiobookSources/types.ts`:

```text
AudiobookSourceAdapter {
  sourceKey, sourceName, catalogLane
  discover({ page, limit, cursor }) -> identifiers
  fetchCandidate({ identifier }) -> NormalizedAudiobookCandidate | null
}
```

### Proposed layout
```text
lib/audiobookSources/
  types.ts                      # existing NormalizedAudiobookCandidate
  adapterRegistry.ts            # register all providers
  internetArchive*.ts           # existing
  providers/
    providerContract.ts         # shared licence/territory/narration helpers
    librivox.ts                 # wrap seed + LV batch
    projectGutenbergHuman.ts    # NEW
    projectGutenbergOpen.ts     # NEW (synthetic)
    wikimediaCommons.ts         # NEW (per-file licence)
```

### Adapter requirements (each)
- Bounded discovery + dry-run
- Normalize into `NormalizedAudiobookCandidate` (already maps to import path `importNormalizedAudiobookCandidate`)
- Chapter extraction (or single-chapter edition when only one file)
- Licence + attribution + `rightsTerritory`
- Stable `source_key` / `source_id`
- Incremental cursor
- Error isolation (one provider failure must not stop others)
- Import limits

### Canonical field mapping (use existing columns; add only what’s missing)

| Canonical | Existing prod column | Gap |
|-----------|----------------------|-----|
| provider | `source_type` | OK |
| provider_book_id | `source_id` / `source_key` | OK |
| title/author/narrator/… | present | OK |
| licence | `rights` only in prod | Add `license_type`, `license_url` when migrations applied |
| rights_territory | missing | **Add** |
| narration_type | missing (`recording_type` in later migrations not live) | **Add** |
| attribution | missing / description | **Add** or reuse external_links |
| playable / quarantine | `playback_status`, `is_active`, `status` | OK |
| chapters | `audiobook_chapters` + `audiobook_files` | OK (`audio_url` on chapters) |

---

## 9. Deduplication strategy

Distinguish:
- same literary work → `audiobook_works` (migration exists; confirm deploy)
- same recording mirrored → one edition + external source refs
- alternate narration / language / synthetic vs human → **separate editions**
- never merge different authors on title alone

Signals: normalized title, author, language, narrator, narration_type, chapter count, duration fingerprint, provider IDs, audio URL identity.

Existing helpers: `lib/audiobookDedup.ts`, `normalized_title_author`.

---

## 10. Dry-run counts (no production writes)

| Provider | Requested / visible | Normalized playable sample | Rejected | Notes |
|----------|--------------------:|---------------------------:|---------:|-------|
| PG human-read | 576 category ids; sampled 100 | **100** | **0** | Strong P0 signal |
| PG Open (via IA search + landing) | 100 docs; collection landing OK | **45** | **15** | Label synthetic; 0 exact title/author overlap in sample |
| Wikimedia Commons | 3545 search hits; sampled 50 | **2** | **48** | Many `application/ogg` false-rejects; rate limits; need `audio/*` + ogg accept |

Artifacts:
- `01-catalog-audit.json`
- `02-dryrun-gutenberg-human.json`
- `03-dryrun-gutenberg-open.json`
- `04-dryrun-wikimedia.json`
- `05-dryrun-summary.json`

---

## 11. Proposed import batches (after approval only)

1. **Batch A — PG human-read** (~100–300 then expand to full ~576–662): chapter map, territory=`US` default with unknown elsewhere, narration=`human_volunteer`.
2. **Batch B — Commons human CC/PD** (fix ogg accept; group multi-file; skip AI unless labelled): 100–300.
3. **Batch C — PG Open synthetic** (200–500 then grow): forced `narration_type=synthetic`, separate browse facet.
4. **Batch D — IA cleanup**: reclassify LV mirrors, mature quarantine review, drop junk identifiers.

Prioritize complete books, working audio, covers, metadata, language diversity — not raw count.

---

## 12. Playback verification

Reuse `lib/audiobookPlayabilityCheck.ts` + auto-approval gates:
- HEAD / ranged GET
- audio content-type (include `audio/*` and ogg)
- non-empty, no HTML error body
- HTTPS preferred
- no login/DRM
- licence metadata present before public eligibility
- bounded representative chapter probes, then staged full checks
- store `last_checked_at` (exists); add failure_count / verification_status if missing

---

## 13. Mobile compatibility

Paths (CLEAN mobile):
- `services/audiobooksApi.ts`
- `app/audiobooks/index.tsx`, `[id].tsx`
- `utils/audiobookPlayback.ts`, `audiobookPlaybackAdapter.ts`

Today: provider/licence/narration **not** in public DTO. Expansion can ship **backend-only** first; mobile needs a later pass for:
- optional narration badge on detail
- sections (Featured Human, Synthetic, PG, …) without cluttering cards
- keep category/language/author as primary browse

---

## 14. Performance plan

Already mostly correct:
- page limit 40, server search, tree/page TTL caches
- no full-catalog prefetch
- no per-card chapter probes

Keep:
- verification backend-only
- thumbnail covers
- chapter pagination on detail if lists grow
- no background catalog polling

Expanded catalog must not increase startup cost or heat.

---

## 15. Remaining legal / technical blockers

1. **Territory-aware rights** for Gutenberg (US PD ≠ worldwide) — product/legal decision + geo or disclosure UX.
2. **Prod schema lag** — registry table + licence/narration columns from later migrations not applied.
3. **Commons MIME** — accept `application/ogg` / `audio/ogg`; handle rate limits.
4. **Chapterization** — many Commons/Open items are one giant file → one-chapter editions or future split.
5. **Mature IA noise** — separate from general classics expansion.
6. **Trademark/attribution** — Project Gutenberg name/logo terms; Commons attribution HTML sanitize.
7. **Synthetic disclosure** — required before Open collection import.

---

## 16. Backend deployment required?

**Yes, eventually** — for new adapters + any schema columns (`narration_type`, `rights_territory`, licence fields, source registry) and VPS deploy of admin.  
**Not required to review this dry-run.**

---

## 17. Mobile changes required?

**Not for backend-only import into existing DTO.**  
**Yes (later)** for narration/provider facets, synthetic labelling, territory notices, and curated sections.

---

## 18. Native build required?

**No** for backend catalog expansion + API-only field additions if the app ignores unknown JSON fields.  
**Yes** only if mobile UI/playback contract changes ship in a binary-dependent way (otherwise OTA may suffice for JS — out of scope until import approval).

---

## Stop condition checklist

- [x] Complete audit
- [x] Provider / legal matrix
- [x] Adapter design
- [x] Bounded dry-run (no writes)
- [x] Expansion forecast
- [ ] Mass import — **stopped pending review**
- [ ] Deploy / commit / push / OTA / build — **not done**

---

## Recommendation

Approve **Batch A (Project Gutenberg human-read)** next: adapters implementing `AudiobookSourceAdapter`, territory metadata, playability verification, then controlled import of complete human editions. Treat LibriVox as **one source among several**, keep IA, and stage synthetic Gutenberg Open / Commons AI into an explicitly labelled lane.

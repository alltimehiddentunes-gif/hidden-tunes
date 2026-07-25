# TV Description Cleanup — Audit & Mutation Plan

## Workspace proof
- Path: `C:\Users\Wills\Desktop\HiddenTunes-TV-40K-EXPANSION`
- Branch: `feature/tv-worldwide-40k-expansion`
- Production API: `https://admin.hiddentunes.com`
- Production Supabase: `https://kojcyswxfuikxmqntwye.supabase.co`
- Africa / Europe / USA / Canada expansion data directories preserved

## Public field
- Table: `tv_videos.description`
- Public API maps via `toTvPublicStation()` → `description` (trimmed by `cleanText`)

## Writers that manufacture bad text
1. `lib/tvExpansion25k/sources/types.ts` → `attachLegalCandidateMeta` writes `Provider: … | Legal basis: … | Discovered: …` into description (≈9,368 rows; waves 2026-07-14 / 07-15 / 07-21)
2. `scripts/run-europe-tv-deep-cities.ts` → `… television stream discovered via Europe deep city search (…)` incl. `_national` / `country-channel-website` (55 rows; 2026-07-25) — includes RTM+
3. `scripts/run-europe-tv-country.ts` → Europe public-directory discovery template (5 rows)
4. `scripts/run-africa-tv-country.ts` → iptv-org discovery template (≈3–10 rows)
5. `scripts/run-africa-tv-deep-sources.ts` / `pass2` → `Africa deep-source candidate (…)` (9 rows)

## Audit counts (pre-mutation)
- Rows with non-null description: **9,491**
- Flagged internal/provenance: **9,440**
- Unflagged (preserve): **51**
- By day: 2026-07-14: 4118 · 2026-07-15: 2911 · 2026-07-21: 2339 · 2026-07-25: 72
- Tiers: verified 7220 · search_only 2220
- States: public_verified 7030 · search_only 2176 · quarantined 231

## Mutation plan
1. **Fix writers first** — stop writing provenance into `description`; leave null unless a real editorial value exists.
2. **DB cleanup** — set flagged descriptions to `null` only; do not invent filler; do not touch other columns.
3. **API safety net** — `sanitizePublicTvDescription` in `toTvPublicStation` rejects known internal templates; returns null.
4. **Import safety** — sanitize at `importVerifiedTvGrowthCandidates` write time.
5. **Mobile** — CLEAN already hides empty blurbs and strips Provider/Legal-basis dumps; no mobile change (read-only confirm).

## Keep / null rules
- Keep only genuine editorial text that fails internal-pattern detection.
- No replacement with generic “Live television channel from X”.
- Null preferred when no trusted alternate field exists (no alternate editorial field found on `tv_videos`).

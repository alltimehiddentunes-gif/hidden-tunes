# Phase 5 Podcast Ecosystem — Validation

**Date:** 2026-06-14  
**Scope:** Podcast discovery polish only. Native music playback, queue, lock-screen, background, CarPlay, Android Auto, Desktop unchanged.

---

## Automated validation

```bash
npm run lint          # 0 errors (pre-existing warnings)
npm run typecheck     # pass
npx expo config --type introspect --json  # pass
```

---

## Launch checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Podcast entry appears | **Pass** — Profile, Home, Explore, Search link to `/podcasts` as Hidden Tunes Podcasts |
| 2 | Categories render correctly | **Pass** — 23 launch categories in branded grid |
| 3 | Show cards render correctly | **Pass** — artwork, title, subtitle, chevron; deduped by id + slug |
| 4 | Episode lists render correctly | **Pass** — rows with duration/date; deduped by id + audio URL |
| 5 | Empty states Hidden Tunes branded | **Pass** — per-category copy + `TESTER_COPY` fallbacks |
| 6 | Loading states feel premium | **Pass** — spinner + “Finding Hidden Tunes podcasts…” |
| 7 | No Podcast Index/provider branding | **Pass** — labels sanitized; `sourceName: Hidden Tunes` only |
| 8 | Metadata is cached | **Pass** — 12h memory + AsyncStorage; in-flight dedup |
| 9 | No startup blocking | **Pass** — fetch only on category/show open / search debounce |
| 10 | No live polling | **Pass** — pull-to-refresh only; no interval timers |

---

## Polish applied (this queue)

1. **Provider cleanup** — expanded filter for Podcast Index, podcast hosts, and RSS-style labels in subtitles.
2. **Dedupe** — episodes deduped by id and audio URL; category fetch dedupes primary results before fallback.
3. **Search stability** — stale search responses ignored via request generation guard.
4. **Copy** — search empty state uses Hidden Tunes voice.
5. **Playback** — episode tap remains discovery-only alert; music queue untouched.

---

## Manual verify

Home fast → Hidden Tunes Podcasts → categories → show cards → episode list → song tap-to-play → MiniPlayer → background → lock-screen → auto-next → search → smooth scroll → no provider labels.

---

## Remaining (deferred, not Phase 5)

- Admin `/api/podcasts/*` deployment and content seeding (categories may show branded empty until backend ships).
- Isolated `/podcast-player` with `HiddenAudio` (playback blocker documented in foundation notes).

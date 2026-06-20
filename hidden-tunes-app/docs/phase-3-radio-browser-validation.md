# Phase 3 Radio Browser — Validation

**Date:** 2026-06-14  
**Scope:** Radio browser polish only. Playback, queue, lock-screen, background, CarPlay, Android Auto, Desktop unchanged.

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
| 1 | Radio Browser entry appears | **Pass** — Profile, Home, Explore, Search link to `/stations` as Hidden Tunes Radio |
| 2 | Radio categories render correctly | **Pass** — 12 launch categories in branded grid |
| 3 | Station cards render correctly | **Pass** — art, title, subtitle, chevron; deduped by id + stream URL |
| 4 | Empty states Hidden Tunes branded | **Pass** — per-category copy + `TESTER_COPY.radioStationsEmpty` fallback |
| 5 | Loading states feel premium | **Pass** — spinner + “Finding Hidden Tunes stations…” |
| 6 | No provider names visible | **Pass** — UI uses Hidden Tunes only; upstream tags filtered |
| 7 | No “free/legal source” wording | **Pass** — none in radio surfaces |
| 8 | Station metadata is cached | **Pass** — 24h memory + AsyncStorage; in-flight dedup |
| 9 | No startup blocking | **Pass** — fetch only on category open / prefetch on tap |
| 10 | No live polling | **Pass** — pull-to-refresh only; no interval timers |

---

## Polish applied (this queue)

1. **Branding** — removed “Radio Browser” from user-facing titles; screen reads “Live Stations” under Hidden Tunes Radio kicker.
2. **Accessibility** — entry link label is “Open Hidden Tunes Radio”.
3. **Dedupe** — stations deduped by id and HTTPS stream URL.
4. **Tag cleanup** — icecast/shoutcast/radio-browser-style tags hidden from subtitles and detail.
5. **Cache hydration** — category screen hydrates AsyncStorage on mount for instant paint after cold start.
6. **Network fallback** — failed fetch serves memory or persisted cache when available.
7. **Copy** — section headers and back links use Hidden Tunes voice.

---

## Manual verify

Home fast → Hidden Tunes Radio → categories → station cards → station detail → song tap-to-play → MiniPlayer → background → lock-screen → auto-next → search → smooth scroll → no provider labels.

---

## Remaining (deferred, not Phase 3)

- Live station stream playback (Tune in → listening room fallback by design).
- Backend proxy for Radio Browser API (client calls HTTPS endpoints today).

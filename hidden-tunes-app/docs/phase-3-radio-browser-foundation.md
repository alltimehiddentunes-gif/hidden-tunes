# Phase 3 Radio Browser — Launch Notes

**Date:** 2026-06-14  
**Scope:** Live station browse only. Playback engine, queue, lock-screen, background, CarPlay, Android Auto, Desktop unchanged.

---

## What shipped

| Area | Implementation |
|------|----------------|
| Entry | Profile → **Hidden Tunes Radio**; `SubtleRadioEntryLink` on Home / Explore / Search |
| Browser home | `app/stations/index.tsx` — 12 launch categories |
| Category list | `app/stations/[categoryId].tsx` — cached station cards, pull-to-refresh |
| Station detail | `app/stations/detail.tsx` — metadata, tune-in stub, listening room fallback |
| Data | `services/radioStationApi.ts` + `utils/radioStationCache.ts` (24h TTL, no polling) |
| Categories | `utils/launchRadioCategories.ts` — 12 launch groups, Hidden Tunes copy |

**Launch categories:** Country, Gospel, Afrobeats, Jazz, Classical, News, Global, Mood, Location, Relationship, Faith, Focus.

---

## Playback blocker (documented)

**In-app live stream playback is intentionally deferred.**

- Station lists use Radio Browser metadata (HTTPS stream URLs validated client-side).
- **Tune in** shows a branded alert — does **not** call `playSong`, `PlayerContext`, or `activeQueue`.
- **Open Hidden Tunes listening room** routes to existing `/radio` song discovery (catalog search → `playSong`).

**Why:** Live Icecast/HLS streams must not share the on-demand auto-next / queue pipeline (Phase 3 audit — critical risk).

**Next phase (out of scope here):** Dedicated stream player module, separate from song playback.

---

## Validation

```bash
npm run lint
npm run typecheck
npx expo config --type introspect --json
```

Manual: Home fast → Radio Browser → categories → stations → detail → song tap-to-play / MiniPlayer / background / auto-next unchanged → no provider labels.

---

## Performance guards

- No startup fetch for stations
- Memory + AsyncStorage cache (max 32 category pages)
- In-flight dedup per category
- FlatList perf props on station lists
- No `setInterval` polling

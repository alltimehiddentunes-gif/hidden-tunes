# UI Responsiveness + Tap Feedback Audit

**Scope:** Mobile tap responsiveness and immediate visual feedback only. No new features, UI redesign, playback logic, queue behavior, Desktop, CarPlay, or Android Auto changes.

**Goal:** Every user action feels instant and premium — heavy work off press handlers, immediate feedback where missing, no blocking navigation during async work.

---

## Findings

| Area | Issue | Risk |
|------|-------|------|
| `MiniPlayer` | `handleMainButton` **awaited** `togglePlayPause()` | Play/pause tap felt blocked until async completed |
| `MediaCard` | `TouchableOpacity` only — no `Pressable` / `android_ripple` | Used across queue, catalog, search TV rows; weak Android feedback |
| Search YouTube row | `handlePress` **awaited** `stopPlayback()` before navigate | TV result tap delayed navigation |
| Search song tap | `handleSongResultPress` always ran full `resolveSearchPlayableSong` + queue rebuild | Extra work on every tap when audio already present |
| Search flat list | `handlePress(item, 0)` ignored row index | Wrong queue index when tapping non-first rows via legacy path |
| Queue | `playQueueItem` re-normalized track object on every tap | Redundant object shaping in hot path |
| Queue / catalog play buttons | `TouchableOpacity` overlay buttons | No ripple / pressed scale |
| Duplicate taps | `PlayerContext` guards in-flight play IDs only | UI could still fire duplicate handlers on rapid double-tap |

### Deferred (playback behavior — out of scope)

- Optimistic `setCurrentSong` before `interruptCurrentPlaybackForUserTap` in `PlayerContext` `playSong` / `playQueue`

### Reference pattern (already good)

- `SearchCatalogSongPressableRow` in `search.tsx` — `Pressable` + `android_ripple` + pressed opacity

---

## Fixes applied

| File | Change |
|------|--------|
| `utils/tapPressGuard.ts` | Shared 450ms duplicate-tap guard (`shouldIgnoreDuplicateTap`) |
| `components/MediaCard.tsx` | `Pressable` + `android_ripple` + pressed scale on card and play button |
| `components/MiniPlayer.tsx` | `void togglePlayPause()` (no await); ripple on control buttons |
| `app/(tabs)/search.tsx` | Tap guard; fast path when audio already on row; trust row index + `searchPlayQueue`; `void stopPlayback()` + immediate YouTube navigate; pass index to `handlePress`; `Pressable` play overlay |
| `app/(tabs)/queue.tsx` | Pre-normalize tracks in `useMemo`; slim `playQueueItem`; tap guard; `Pressable` play overlay |
| `components/catalog/CatalogSongRow.tsx` | `Pressable` play overlay with ripple |

---

## Validation

```bash
npm run lint
npm run typecheck
npx expo config --type introspect --json
```

**Manual:** song tap instant, MiniPlayer opens instantly, search result tap, buttons respond immediately, no double playback, background/lockscreen/auto-next unchanged.

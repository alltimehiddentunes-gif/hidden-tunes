# Heat / Freeze Performance Audit

## Scope

This pass focused on heat, freezing, sluggish search, navigation stalls, and delayed visible response without changing playback architecture, queue architecture, Android Auto, CarPlay, Desktop, radio playback, podcast playback, video playback, or HiddenAudio.

## Root Causes Found

### Search contention

Evidence: `app/search.tsx` already protected core backend music and TV search with request IDs and abort controllers, but secondary media search in `hooks/useDeferredSearchMediaSections.ts` launched podcast and radio requests together after a short defer. During typing, that could make lower-priority media compete with the music-first search path.

Impact: search could feel hotter or less responsive on slower phones because podcasts and radio were allowed to start at the same time even though they render below music, artists, albums, playlists, and videos.

Fix: podcast and radio search now load progressively. Podcasts start first after a longer defer, radio starts after podcasts settle, and each has generation guards plus dev-only request timing logs. Music search remains first.

### Premature secondary search fallback

Evidence: external fallback search used a 320 ms debounce. That is responsive, but on mobile it can fire while the user is still typing and while local/backend search is still settling.

Impact: avoidable network and metadata work while the user is still changing the query.

Fix: external fallback debounce increased to 500 ms. It still feels responsive but reduces churn.

### Podcast and radio result coupling

Evidence: search UI only displayed podcast and radio sections after both deferred media requests matched the submitted query.

Impact: podcasts could be ready but hidden while radio was still pending, increasing perceived loading time.

Fix: podcast and radio sections now have separate readiness flags. Each appears when its own result set is current.

### Missing lightweight diagnostics

Evidence: performance investigation had limited opt-in diagnostics for render/request heat in the affected search and world screens.

Impact: future QA had no simple way to distinguish render bursts from fetch bursts.

Fix: added dev-only heat diagnostics behind the existing heavy performance diagnostics toggle. No production logging is enabled.

## Render Findings

`app/search.tsx` now logs render counts in development when heavy diagnostics are enabled. This gives evidence for repeated render bursts without adding production cost.

`screens/WorldDetailScreen.tsx` now logs render counts with world id, track count, and loading state. The world detail screen already uses a focused catalog-track hook and virtualized list behavior; no broad world/radio/podcast/video preloading was found in this route.

## Search Findings

Music remains the priority path. Local catalog search, backend music search, and TV search already had cache/request guards. The risky work was lower-priority deferred podcast/radio search, which is now staggered and guarded.

Podcast and radio search continue to use 40-item discovery pages through the existing discovery services. No startup preload or bulk loading was added.

## Image Findings

No image preloading blocker was added or found in the modified search path. This pass did not change artwork loading, preserving the premium UI while avoiding new image work during typing.

## Navigation Findings

World detail navigation was checked because it was a likely heat source. The route does not start radio, podcast, video, and recommendation fetches together. It uses world metadata plus catalog tracks and memoized alignment. Added diagnostics will make navigation stalls visible during QA.

## Background Work Findings

No polling loop or background timer was added. Deferred search timers are cancelled on query changes and unmount. Stale podcast/radio results are ignored through request generation guards.

## Files Changed

- `app/search.tsx`
- `hooks/useDeferredSearchMediaSections.ts`
- `hooks/useRenderBurstDiagnostics.ts`
- `screens/WorldDetailScreen.tsx`
- `utils/heatPerformanceDiagnostics.ts`
- `docs/heat-freeze-performance-audit.md`

## Manual QA Checklist

- Open Home and confirm initial UI responds quickly.
- Type several search queries quickly and confirm music results remain responsive.
- Confirm podcast results can appear before radio results.
- Confirm radio results appear without blocking typing.
- Tap between Home, Search, Radio, Podcasts, and Emotional Worlds repeatedly.
- Confirm no black pages, no endless loaders, and no repeated request bursts in diagnostics.
- Confirm playback, radio, podcast, and video behavior remain unchanged.

## Remaining Risks

Manual device QA is still required for real phone heat, frame drops, and tap responsiveness. The code now contains better dev-only evidence points, but emulator or typecheck validation cannot prove thermal behavior by itself.

## Verdict

The highest-risk search heat source found in this pass was lower-priority media search contention. That has been reduced with progressive loading, separate readiness, cancellation, and opt-in diagnostics. Launch readiness still depends on phone QA confirming no heat, freezes, or navigation stalls under real use.

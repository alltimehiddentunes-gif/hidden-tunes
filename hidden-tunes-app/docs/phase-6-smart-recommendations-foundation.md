# Phase 6 — Smart Recommendations Foundation

Launch-ready personalized discovery for Hidden Tunes mobile. All rails use the existing catalog, listener signals, and `/radio` smart radio — no playback engine changes.

## Recommendation surfaces

| Surface | Builder | Mount rule |
|---------|---------|------------|
| Because You Played | `buildBecauseYouPlayed` | Requires playback history |
| More Like This | `buildMoreLikeThis` | Current or recent song seed |
| Recommended For You | `buildRecommendedForYou` / cold-start blend | Always (editorial fallback for new users) |
| Continue Listening | `buildContinueListeningRail` | Recent plays mapped to catalog |
| Rediscover Favorites | `buildRediscoverFavorites` | ≥3 favorites |
| New-user recommendations | `buildNewUserRecommendations` | No history — trending, worlds, genres, moods, artists |
| Artist / Album / Genre / Mood Radio | `buildSmartRadioEntries` | Up to 4 chips on Home + Explore |

## Pipeline

```
catalog slice (≤220 songs)
  + recently played + favorites + onboarding prefs + current song
    → getSharedDiscoverySnapshot()
      → buildSmartRecommendationsBundle()
      → in-memory cache (fingerprint)
      → AsyncStorage last-good bundle (12h TTL)
```

## Cold-start fallback

When there is no playback history and no favorites:

- Trending / recently added songs
- Featured genre hubs
- Emotional worlds + mood collections
- Popular artists from catalog
- Onboarding genre/mood boost when available

## Files

| File | Role |
|------|------|
| `services/smartRecommendations.ts` | All recommendation builders |
| `services/discoveryCache.ts` | Snapshot orchestration + cache persist hook |
| `utils/smartRecommendationsCache.ts` | AsyncStorage 12h cache |
| `utils/smartRadioNavigation.ts` | Artist/album/genre/mood radio routes |
| `utils/homeFeedRows.ts` | Home rail ordering |
| `services/onboardingPreferences.ts` | `loadOnboardingPreferences()` |
| `services/listenerRanking.ts` | Onboarding boost in preference maps |
| `services/recentlyPlayedEngine.ts` | Onboarding-aware radio seed fallback |

## Validation

```bash
npm run lint
npm run typecheck
npx expo config --type introspect --json
```

Manual: Home/Explore open fast, recommendations visible for new and returning users, radio chips launch `/radio`, tap-to-play and MiniPlayer unchanged.

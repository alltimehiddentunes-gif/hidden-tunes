export const APP_BRAND_NAME = "Hidden Tunes";

/** Calm, tester-friendly copy — no stack traces, localhost, or dev-server wording. */
export const TESTER_COPY = {
  splashSubtitle: "Opening your listening room…",
  catalogWarming: "Your catalog is warming up. Pull down to refresh when you're online.",
  catalogEmptyHome:
    "Your listening room is getting ready. Pull down to refresh when you're online.",
  searchNoMatch:
    "Try another spelling, artist name, or mood — your catalog is still loading in the background.",
  networkUnavailable:
    "Can't reach the server right now. Cached music still works — try again in a moment.",
  offlineHint: "You're offline. Streaming returns when your connection does.",
  tvCatalogRefresh:
    "TV catalog isn't available right now. Pull to refresh when you're back online.",
  tvSearchUnavailable: "TV search isn't available right now. Try again in a moment.",
  videoDiscoveryLoading: "Finding Hidden Tunes videos…",
  videoDiscoveryEmpty:
    "No videos in this collection yet. Try another category or pull to refresh.",
  radioLoadFailed: "Couldn't load tracks right now. Pull to refresh when you're online.",
  radioStationsLoading: "Finding Hidden Tunes stations…",
  radioStationsEmpty:
    "No stations in this room yet. Try another category or open a listening room.",
  lyricsLoadFailed: "Lyrics aren't available for this track right now.",
} as const;

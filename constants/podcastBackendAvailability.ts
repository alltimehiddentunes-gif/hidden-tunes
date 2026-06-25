/**
 * Hidden Tunes podcast catalog API is currently unavailable (404).
 * Skip the dead HT round-trip and use iTunes/RSS until backend ships.
 *
 * Blocker: GET /api/podcasts/shows and /api/podcasts/episodes return 404.
 */
export const HT_PODCAST_API_KNOWN_UNAVAILABLE = true;

let htShowsApiConfirmed404 = HT_PODCAST_API_KNOWN_UNAVAILABLE;
let htEpisodesApiConfirmed404 = HT_PODCAST_API_KNOWN_UNAVAILABLE;

export function shouldSkipHiddenTunesPodcastShowsApi() {
  return htShowsApiConfirmed404;
}

export function shouldSkipHiddenTunesPodcastEpisodesApi(showId: string) {
  if (htEpisodesApiConfirmed404) return true;
  // iTunes-sourced shows never had HT episode rows.
  return String(showId || "").startsWith("itunes-");
}

export function noteHiddenTunesPodcastShowsApi404() {
  htShowsApiConfirmed404 = true;
}

export function noteHiddenTunesPodcastEpisodesApi404() {
  htEpisodesApiConfirmed404 = true;
}

export const PODCAST_BACKEND_BLOCKER =
  "HT /api/podcasts/* returns 404 — mobile uses iTunes Search + RSS fallback only.";

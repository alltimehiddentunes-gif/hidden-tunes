/**
 * Cold-start policy for main search backend requests.
 * Render free-tier wake can exceed the shared 5.5s catalog timeout.
 */

/** First attempt — covers warm/idle API without feeling stuck. */
export const SEARCH_COLD_START_FIRST_TIMEOUT_MS = 12_000;

/** Retry attempt — covers observed cold wake (~24s). */
export const SEARCH_COLD_START_RETRY_TIMEOUT_MS = 28_000;

export const SEARCH_COLD_START_MAX_ATTEMPTS = 2;

export const SEARCH_COLD_START_RETRY_DELAY_MS = 1_200;

export function searchAttemptTimeoutMs(attempt: number): number {
  return attempt <= 1
    ? SEARCH_COLD_START_FIRST_TIMEOUT_MS
    : SEARCH_COLD_START_RETRY_TIMEOUT_MS;
}

/** Failures must never be cached as successful empty result sets. */
export function shouldCacheBackendSearchResult(hadTransportError: boolean): boolean {
  return !hadTransportError;
}

/**
 * True only for a completed, successful search with no matches.
 * Pending, retrying, or failed transport must not look like zero matches.
 */
export function shouldShowGenuineZeroMatches(options: {
  backendPending: boolean;
  backendError: string | null | undefined;
  resultCount: number;
  radioLoading: boolean;
  podcastsLoading: boolean;
}): boolean {
  return (
    !options.backendPending &&
    !options.backendError &&
    options.resultCount === 0 &&
    !options.radioLoading &&
    !options.podcastsLoading
  );
}

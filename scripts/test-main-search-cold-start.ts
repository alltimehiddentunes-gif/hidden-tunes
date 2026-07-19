/**
 * Main search cold-start policy tests.
 * Run: npx tsx scripts/test-main-search-cold-start.ts
 */
import {
  SEARCH_COLD_START_FIRST_TIMEOUT_MS,
  SEARCH_COLD_START_MAX_ATTEMPTS,
  SEARCH_COLD_START_RETRY_TIMEOUT_MS,
  searchAttemptTimeoutMs,
  shouldCacheBackendSearchResult,
  shouldShowGenuineZeroMatches,
} from "../utils/searchColdStartPolicy";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertOk(value: unknown, label: string) {
  if (!value) {
    throw new Error(`${label}: expected truthy value`);
  }
}

function main() {
  assertEqual(searchAttemptTimeoutMs(1), SEARCH_COLD_START_FIRST_TIMEOUT_MS, "first timeout");
  assertEqual(searchAttemptTimeoutMs(2), SEARCH_COLD_START_RETRY_TIMEOUT_MS, "retry timeout");
  assertOk(SEARCH_COLD_START_FIRST_TIMEOUT_MS > 5500, "first timeout above shared catalog timeout");
  assertOk(SEARCH_COLD_START_RETRY_TIMEOUT_MS >= 24000, "retry timeout covers observed cold wake");
  assertEqual(SEARCH_COLD_START_MAX_ATTEMPTS, 2, "max attempts");

  assertEqual(shouldCacheBackendSearchResult(false), true, "cache success");
  assertEqual(shouldCacheBackendSearchResult(true), false, "do not cache transport error");

  assertEqual(
    shouldShowGenuineZeroMatches({
      backendPending: false,
      backendError: null,
      resultCount: 0,
      radioLoading: false,
      podcastsLoading: false,
    }),
    true,
    "genuine zero"
  );

  assertEqual(
    shouldShowGenuineZeroMatches({
      backendPending: true,
      backendError: null,
      resultCount: 0,
      radioLoading: false,
      podcastsLoading: false,
    }),
    false,
    "pending is not zero"
  );

  assertEqual(
    shouldShowGenuineZeroMatches({
      backendPending: false,
      backendError: "timeout",
      resultCount: 0,
      radioLoading: false,
      podcastsLoading: false,
    }),
    false,
    "error is not zero"
  );

  assertEqual(
    shouldShowGenuineZeroMatches({
      backendPending: false,
      backendError: null,
      resultCount: 3,
      radioLoading: false,
      podcastsLoading: false,
    }),
    false,
    "hits are not zero"
  );

  console.log("test-main-search-cold-start: ok");
}

main();

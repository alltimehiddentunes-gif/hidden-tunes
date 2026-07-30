/**
 * Mobile global Search restoration tests.
 * Run: npx tsx scripts/test-mobile-search-restoration.ts
 */
import {
  expandGlobalSearchQueryVariants,
  normalizeGlobalSearchQuery,
  resolveGlobalSearchBackendQuery,
} from "../utils/globalSearchQuery";
import {
  shouldCacheBackendSearchResult,
  shouldShowGenuineZeroMatches,
} from "../utils/searchColdStartPolicy";
import { dedupeSearchRowsByCanonicalId } from "../utils/searchResultIdentity";

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
  // 1–2. Alias / plural handling
  assertEqual(resolveGlobalSearchBackendQuery("Afrobeat"), "Afrobeats", "Afrobeat alias");
  assertEqual(resolveGlobalSearchBackendQuery("afrobeats"), "Afrobeats", "afrobeats canonical");
  assertEqual(resolveGlobalSearchBackendQuery("Afrobeats"), "Afrobeats", "Afrobeats stable");

  // 3. Hyphen/space normalisation
  assertEqual(normalizeGlobalSearchQuery("Al-Jazeera"), "Al Jazeera", "hyphen normalize");
  assertEqual(resolveGlobalSearchBackendQuery("Al-Jazeera"), "Al Jazeera", "hyphen backend query");

  // 4. Country name preserved as free-text for music
  assertEqual(normalizeGlobalSearchQuery("South Africa"), "South Africa", "country free-text");
  assertOk(expandGlobalSearchQueryVariants("Ghana").length >= 1, "ghana variants");

  // R&B must remain exact where intended
  assertEqual(resolveGlobalSearchBackendQuery("R&B"), "R&B", "R&B exact");

  // 5–9. Empty / error / abort states
  assertEqual(
    shouldShowGenuineZeroMatches({
      backendPending: false,
      backendError: null,
      resultCount: 0,
      radioLoading: false,
      podcastsLoading: false,
    }),
    true,
    "genuine empty"
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
    "loading is not empty"
  );
  assertEqual(
    shouldShowGenuineZeroMatches({
      backendPending: false,
      backendError: "HTTP 503",
      resultCount: 0,
      radioLoading: false,
      podcastsLoading: false,
    }),
    false,
    "HTTP failure is not empty"
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
    "timeout is not empty"
  );
  assertEqual(
    shouldShowGenuineZeroMatches({
      backendPending: false,
      backendError: null,
      radioError: "network",
      resultCount: 0,
      radioLoading: false,
      podcastsLoading: false,
    }),
    false,
    "radio transport failure is not empty"
  );
  assertEqual(shouldCacheBackendSearchResult(true), false, "do not cache failures");

  // Prove the historic ASI count bug: missing + made count equal songs only.
  {
    const broken = new Function(
      "return (() => { const songs = 0; const albums = 5; const tv = 3; const radio = 8; const apkResultCount = songs\nalbums\ntv\nradio; return apkResultCount; })()"
    )();
    const fixed = 0 + 5 + 3 + 8;
    assertEqual(broken, 0, "ASI made match count equal songs-only (0)");
    assertEqual(fixed, 16, "explicit sum includes all groups");
  }

  // 13–14. Stable-ID dedupe keeps same title across types
  const rows = dedupeSearchRowsByCanonicalId(
    [
      { id: "a", title: "News" },
      { id: "b", title: "News" },
      { id: "a", title: "News" },
    ],
    (row) => String(row.id)
  );
  assertEqual(rows.length, 2, "dedupe by id not title");

  // Phrase queries are not forcibly rewritten to a genre-only token
  assertEqual(
    resolveGlobalSearchBackendQuery("Afrobeats latest"),
    "Afrobeats latest",
    "phrase preserved"
  );

  console.log("test-mobile-search-restoration: ok");
}

main();

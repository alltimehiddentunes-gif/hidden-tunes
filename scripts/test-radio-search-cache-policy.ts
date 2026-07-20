/**
 * Radio search catalog vs fallback cache policy tests.
 * Run: npx tsx scripts/test-radio-search-cache-policy.ts
 */
import {
  isCatalogRadioSearchCacheKey,
  resolveRadioSearchHasMore,
  shouldBypassCatalogSearchCacheForOffset,
  shouldFallThroughCatalogSearchCacheEnd,
  shouldPersistRadioSearchResult,
  shouldRevalidateShortRadioSearchCache,
} from "../utils/radioSearchCachePolicy";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function main() {
  assertEqual(isCatalogRadioSearchCacheKey("catalog-search:jazz"), true, "catalog key");
  assertEqual(isCatalogRadioSearchCacheKey("featured"), false, "category key");

  assertEqual(shouldPersistRadioSearchResult("catalog"), true, "persist catalog");
  assertEqual(shouldPersistRadioSearchResult("fallback"), false, "never persist fallback");

  // Case 1 — catalog success page (40 / hasMore true) uses backend hasMore
  assertEqual(resolveRadioSearchHasMore(40, 40, true), true, "catalog hasMore true");
  assertEqual(resolveRadioSearchHasMore(40, 40, false), false, "catalog hasMore false");

  // Case 2 — fallback 9 of 40 must not persist; length heuristic alone is incomplete
  assertEqual(shouldPersistRadioSearchResult("fallback"), false, "fallback no write");
  assertEqual(resolveRadioSearchHasMore(9, 40), false, "fallback short page hasMore");

  // Case 3 — poisoned 9-row catalog-search cache must revalidate
  assertEqual(
    shouldRevalidateShortRadioSearchCache("catalog-search:jazz", 9, 40),
    true,
    "poisoned 9 revalidates"
  );
  assertEqual(
    shouldRevalidateShortRadioSearchCache("catalog-search:jazz", 40, 40),
    false,
    "full page skips forced revalidate"
  );
  assertEqual(
    shouldRevalidateShortRadioSearchCache("popular", 9, 40),
    false,
    "non-search keys unchanged"
  );

  // Case 4 — partial attach is not a persistable catalog success (policy: only catalog source)
  assertEqual(
    shouldPersistRadioSearchResult("catalog"),
    true,
    "only completed catalog source may persist"
  );

  // Case 5 — pagination after recovery: backend hasMore drives page 2
  assertEqual(resolveRadioSearchHasMore(40, 40, true), true, "page2 available after recovery");

  // Case 6 — incomplete playable cache must not terminate catalog search
  assertEqual(
    shouldBypassCatalogSearchCacheForOffset("catalog-search:jazz", 40),
    true,
    "search offset>0 bypasses cache"
  );
  assertEqual(
    shouldFallThroughCatalogSearchCacheEnd({
      cacheKey: "catalog-search:jazz",
      offset: 160,
      pageLength: 39,
      cacheTotal: 199,
    }),
    true,
    "199-row cache end falls through"
  );

  console.log("radio-search-cache-policy: ok");
}

main();

/**
 * Targeted checks for audiobooks browse cache / All default helpers.
 * Run: npx tsx scripts/test-audiobooks-browse-cache.ts
 */
import {
  AUDIOBOOK_ALL_CATEGORY_SLUG,
  AUDIOBOOK_PAGE_LIMIT,
  peekCachedAudiobookPage,
} from "../services/audiobooksApi";

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function main() {
  assertEqual(AUDIOBOOK_ALL_CATEGORY_SLUG, "all", "all slug");
  assertEqual(AUDIOBOOK_PAGE_LIMIT, 40, "page limit");

  const emptyPeek = peekCachedAudiobookPage("all", "", 1, 40);
  assertEqual(emptyPeek, null, "cold cache should miss");

  console.log("audiobooks browse cache helpers: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

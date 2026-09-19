/**
 * Audiobooks retained-route focus/resume and shared-request cache contract.
 * Run: npx tsx scripts/test-audiobooks-focus-resume.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  fetchAudiobookCategory,
  peekCachedAudiobookPage,
} from "../services/audiobooksApi";

const root = path.resolve(__dirname, "..");
const screen = fs.readFileSync(path.join(root, "app/audiobooks/index.tsx"), "utf8");

assert.match(screen, /import \{ router, useFocusEffect, useIsFocused \} from "expo-router"/);
assert.match(screen, /const isFocused = useIsFocused\(\)/);
assert.ok(
  (screen.match(/if \(!isFocused/g) || []).length >= 3,
  "tree, browse, and search loads must all stop while the retained route is blurred"
);
assert.match(screen, /return \(\) => controller\.abort\(\);\s*\}, \[isFocused\]\);/);
assert.match(screen, /\}, \[isFocused, selectedCategory, searchQuery\]\);/);
assert.match(screen, /\}, \[isFocused, searchQuery\]\);/);
assert.match(screen, /categoryRequestRef\.current \+= 1/);
assert.match(screen, /searchRequestRef\.current \+= 1/);
assert.match(screen, /categoryPaginationRequestRef\.current \+= 1/);
assert.match(screen, /searchPaginationRequestRef\.current \+= 1/);
assert.match(
  screen,
  /useFocusEffect\(\s*useCallback\(\(\) => \{\s*setLoadingMore\(false\);\s*setSearchLoadingMore\(false\);\s*return \(\) => \{/,
  "focus must unlock pagination without setting state from blur/unmount cleanup"
);
assert.match(
  screen,
  /\.catch\(\(error\) => \{\s*if \(controller\.signal\.aborted \|\| hasAbortError\(error\)\) return;\s*setCategories\(\[\]\)/,
  "an aborted tree request is cancellation, never an empty category result"
);
assert.ok(
  (screen.match(/controller\.signal\.aborted/g) || []).length >= 5,
  "blurred requests must not commit or finalize visible state"
);
for (const ref of ["treeAbortRef", "browseAbortRef", "searchAbortRef", "paginationAbortRef"]) {
  assert.match(screen, new RegExp(`${ref}\\.current\\?\\.abort\\(\\)`));
}

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function verifySharedResumeRequest() {
  const originalFetch = globalThis.fetch;
  const gate = createDeferred();
  let fetchCalls = 0;

  globalThis.fetch = (async () => {
    fetchCalls += 1;
    await gate.promise;
    return new Response(
      JSON.stringify({
        success: true,
        audiobooks: [
          {
            id: "focus-resume-book",
            slug: "focus-resume-book",
            title: "Focus Resume Book",
            description: "Deterministic catalog test fixture.",
          },
        ],
        pagination: { page: 1, limit: 40, total: 1, totalPages: 1, hasMore: false },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const category = "focus-resume-contract";
    const firstController = new AbortController();
    const firstFocus = fetchAudiobookCategory(category, {
      page: 1,
      limit: 40,
      signal: firstController.signal,
    });

    firstController.abort();

    const secondController = new AbortController();
    const resumedFocus = fetchAudiobookCategory(category, {
      page: 1,
      limit: 40,
      signal: secondController.signal,
    });

    assert.equal(fetchCalls, 1, "refocus must join the existing keyed page request");
    gate.resolve();

    await assert.rejects(firstFocus, (error: unknown) => {
      return error instanceof Error && error.name === "AbortError";
    });

    const resumedPage = await resumedFocus;
    assert.deepEqual(
      resumedPage.items.map((item) => item.id),
      ["focus-resume-book"],
      "the current focus receives the shared result"
    );

    const cached = peekCachedAudiobookPage("category", category, 1, 40);
    assert.deepEqual(
      cached?.items.map((item) => item.id),
      ["focus-resume-book"],
      "the completed shared request populates the bounded page cache"
    );

    const callsBeforeWarmFocus = fetchCalls;
    const warmPage = await fetchAudiobookCategory(category, { page: 1, limit: 40 });
    assert.equal(fetchCalls, callsBeforeWarmFocus, "warm refocus performs no network request");
    assert.equal(warmPage.items[0]?.id, "focus-resume-book");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

verifySharedResumeRequest()
  .then(() => {
    console.log("PASS audiobooks focus-resume", {
      focusGuards: 3,
      staleCommitGuards: true,
      sharedInflightRequest: true,
      warmRefocusRequests: 0,
    });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

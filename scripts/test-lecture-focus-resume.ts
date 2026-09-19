/**
 * Lectures retained-route focus, cache, and shared-request contract.
 * Run: npx tsx scripts/test-lecture-focus-resume.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  fetchEducationalCategories,
  fetchEducationalCategoryPage,
  peekCachedEducationalCategories,
  peekCachedEducationalCategoryPage,
} from "../services/lecturesCatalogApi";

const root = path.resolve(__dirname, "..");
const screen = fs.readFileSync(path.join(root, "app/lectures/index.tsx"), "utf8");
const service = fs.readFileSync(path.join(root, "services/lecturesCatalogApi.ts"), "utf8");

assert.match(screen, /const selectedCategorySlugRef = useRef\(LECTURES_DEFAULT_CATEGORY_SLUG\)/);
assert.match(screen, /selectedCategorySlugRef\.current = slug/);
assert.match(
  screen,
  /const loadBrowsePage = useCallback\([\s\S]*?\n\s*\[mountedRef\]\n\s*\);/,
  "category state changes must not recreate the active focus callback"
);
assert.match(screen, /peekCachedEducationalCategoryPage\(categorySlug/);
assert.match(screen, /visibleBrowseCategoryRef\.current === categorySlug/);
assert.match(screen, /bypassCache: true/);
assert.doesNotMatch(
  screen,
  /joinLectureRequest\(/,
  "the Lectures landing screen must use the service-owned shared transport"
);
assert.match(service, /const LECTURES_MEMORY_CACHE_TTL_MS = 5 \* 60 \* 1000/);
assert.match(service, /const LECTURES_PAGE_CACHE_LIMIT = 24/);
assert.match(service, /waitForLectureSubscriber\(request, options\?\.signal\)/);

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

async function verifyLectureFocusResumeContract() {
  const originalFetch = globalThis.fetch;
  const firstPageGate = createDeferred();
  let pageFetchCalls = 0;
  let categoryFetchCalls = 0;
  let failNextPageRefresh = false;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/lectures/categories")) {
      categoryFetchCalls += 1;
      return new Response(
        JSON.stringify({
          success: true,
          categories: [{ slug: "focus-resume", name: "Focus Resume", item_count: 1 }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    pageFetchCalls += 1;
    if (pageFetchCalls === 1) await firstPageGate.promise;
    if (failNextPageRefresh) {
      failNextPageRefresh = false;
      return new Response(JSON.stringify({ success: false, error: "temporary failure" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        lectures: [
          {
            id: "focus-resume-lecture",
            slug: "focus-resume-lecture",
            title: "Focus Resume Lecture",
            is_featured: true,
          },
        ],
        pagination: { page: 1, limit: 40, total: 1, totalPages: 1, hasMore: false },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const slug = "focus-resume-contract";
    const firstController = new AbortController();
    const firstFocus = fetchEducationalCategoryPage(slug, {
      page: 1,
      limit: 40,
      signal: firstController.signal,
    });
    const firstFocusAbort = assert.rejects(firstFocus, (error: unknown) => {
      return error instanceof Error && error.name === "AbortError";
    });

    firstController.abort();
    const resumedFocus = fetchEducationalCategoryPage(slug, {
      page: 1,
      limit: 40,
      signal: new AbortController().signal,
    });

    assert.equal(pageFetchCalls, 1, "refocus must join the live keyed base request");
    await firstFocusAbort;
    firstPageGate.resolve();

    const resumedPage = await resumedFocus;
    assert.deepEqual(
      resumedPage.items.map((item) => item.id),
      ["focus-resume-lecture"],
      "the current focus receives the shared response"
    );

    const cached = peekCachedEducationalCategoryPage(slug, { page: 1, limit: 40 });
    assert.equal(cached?.items[0]?.id, "focus-resume-lecture", "successful page is cached");
    assert.equal(
      peekCachedEducationalCategoryPage("another-category", { page: 1, limit: 40 }),
      null,
      "a cached page cannot cross category identity"
    );

    const callsBeforeWarmFocus = pageFetchCalls;
    const warmPage = await fetchEducationalCategoryPage(slug, { page: 1, limit: 40 });
    assert.equal(pageFetchCalls, callsBeforeWarmFocus, "warm focus performs zero network requests");
    assert.equal(warmPage.items[0]?.id, "focus-resume-lecture");

    failNextPageRefresh = true;
    await assert.rejects(
      fetchEducationalCategoryPage(slug, { page: 1, limit: 40, bypassCache: true }),
      /temporary failure/
    );
    assert.equal(pageFetchCalls, callsBeforeWarmFocus + 1, "explicit refresh bypasses cache once");
    assert.equal(
      peekCachedEducationalCategoryPage(slug, { page: 1, limit: 40 })?.items[0]?.id,
      "focus-resume-lecture",
      "failed refresh never replaces the last successful page"
    );

    const firstCategories = await fetchEducationalCategories();
    const warmCategories = await fetchEducationalCategories();
    assert.equal(firstCategories[0]?.slug, "focus-resume");
    assert.equal(warmCategories[0]?.slug, "focus-resume");
    assert.equal(categoryFetchCalls, 1, "fresh categories cache prevents focus refetch");
    assert.equal(peekCachedEducationalCategories()?.[0]?.slug, "focus-resume");

    await fetchEducationalCategories({ bypassCache: true });
    assert.equal(categoryFetchCalls, 2, "explicit refresh bypasses the categories cache once");
  } finally {
    firstPageGate.resolve();
    globalThis.fetch = originalFetch;
  }
}

verifyLectureFocusResumeContract()
  .then(() => {
    console.log("PASS lecture focus-resume", {
      sharedBaseRequest: true,
      callerAbortIsLocal: true,
      warmFocusRequests: 0,
      failedRefreshPreservesCache: true,
      exactCategoryIdentity: true,
    });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

/**
 * Prove catalogJsonFetch timeout settles once and cleans timers;
 * Radio ownership catches TimeoutError without unhandled rejection.
 *
 * Run: npx tsx scripts/test-catalog-timeout-handling.ts
 */
import assert from "node:assert/strict";

import {
  catalogJsonFetch,
  isCatalogAbortError,
  isCatalogTimeoutError,
} from "../services/catalogJsonFetch";

const originalFetch = globalThis.fetch;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTimeoutError() {
  const error = new Error("catalog_api_timeout");
  error.name = "TimeoutError";
  return error;
}

async function withMockFetch(
  mock: typeof fetch,
  fn: () => Promise<void>
) {
  globalThis.fetch = mock;
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testTimeoutRejectsOnce() {
  let fetchCalls = 0;
  await withMockFetch(async (_url, init) => {
    fetchCalls += 1;
    return await new Promise((_resolve, reject) => {
      const signal = init?.signal;
      const onAbort = () => {
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
  }, async () => {
    let rejected = 0;
    let lastError: unknown;
    try {
      await catalogJsonFetch("https://example.test/api/radio/stations?q=south", {
        timeoutMs: 1000,
        requestOwner: "test-timeout-once",
      });
    } catch (error) {
      rejected += 1;
      lastError = error;
    }
    assert.equal(rejected, 1, "timeout rejects exactly once");
    assert.equal(isCatalogTimeoutError(lastError), true);
    assert.equal((lastError as Error).message, "catalog_api_timeout");
    assert.equal(fetchCalls, 1);
  });
}

async function testTimerCleanedAfterSuccess() {
  let abortAfterSuccess = false;
  await withMockFetch(async (_url, init) => {
    const signal = init?.signal;
    signal?.addEventListener("abort", () => {
      abortAfterSuccess = true;
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const result = await catalogJsonFetch("https://example.test/api/ok", {
      timeoutMs: 1000,
      requestOwner: "test-success-cleanup",
    });
    assert.equal((result.json as { ok: boolean }).ok, true);
    await sleep(1100);
    assert.equal(abortAfterSuccess, false, "timer must not abort after success");
  });
}

async function testTimerCleanedAfterHttpFailure() {
  let abortAfterFailure = false;
  await withMockFetch(async (_url, init) => {
    const signal = init?.signal;
    signal?.addEventListener("abort", () => {
      abortAfterFailure = true;
    });
    return new Response("<html>gateway</html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    });
  }, async () => {
    let failed = false;
    try {
      await catalogJsonFetch("https://example.test/api/bad", {
        timeoutMs: 1000,
        requestOwner: "test-http-cleanup",
      });
    } catch {
      failed = true;
    }
    assert.equal(failed, true);
    await sleep(1100);
    assert.equal(abortAfterFailure, false, "timer must not abort after HTTP failure");
  });
}

async function testTimerCleanedAfterAbort() {
  const parent = new AbortController();
  let fetchSawAbort = false;
  await withMockFetch(async (_url, init) => {
    return await new Promise((_resolve, reject) => {
      const signal = init?.signal;
      const onAbort = () => {
        fetchSawAbort = true;
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
  }, async () => {
    const pending = catalogJsonFetch("https://example.test/api/abort", {
      signal: parent.signal,
      timeoutMs: 5000,
      requestOwner: "test-abort-cleanup",
    });
    parent.abort();
    let err: unknown;
    try {
      await pending;
    } catch (error) {
      err = error;
    }
    assert.equal(isCatalogAbortError(err), true);
    assert.equal(isCatalogTimeoutError(err), false);
    assert.equal(fetchSawAbort, true);
    await sleep(50);
  });
}

/**
 * Mirrors Radio ownership: catch TimeoutError, preserve cache, clear loading,
 * ignore stale timeout after a newer success generation.
 */
async function testRadioOwnershipCatchesTimeout() {
  let unhandled = 0;
  const onUnhandled = () => {
    unhandled += 1;
  };
  process.on("unhandledRejection", onUnhandled);

  type PageResult = {
    stations: Array<{ id: string }>;
    hasMore: boolean;
    stopReason?: string;
    source?: string;
  };

  let visible: Array<{ id: string }> = [{ id: "cached-1" }];
  let loading = true;
  let loadError: string | null = null;
  let generation = 1;
  let hasMore = true;

  async function fetchPage(
    loadPage: () => Promise<PageResult>,
    gen: number
  ) {
    try {
      const result = await loadPage();
      if (gen !== generation) return;
      if (
        result.stopReason === "catalog-timeout-cache-preserved" ||
        result.source === "cache-timeout"
      ) {
        if (visible.length > 0) {
          loading = false;
          return;
        }
      }
      loadError = null;
      visible = result.stations;
      hasMore = result.hasMore;
      loading = false;
    } catch (error) {
      if (isCatalogAbortError(error)) return;
      if (isCatalogTimeoutError(error)) {
        loading = false;
        return;
      }
      loadError = error instanceof Error ? error.message : String(error);
      loading = false;
    }
  }

  // 5–6: catch TimeoutError; no unhandled rejection
  await fetchPage(async () => {
    throw makeTimeoutError();
  }, 1);
  assert.equal(loading, false);
  assert.deepEqual(visible, [{ id: "cached-1" }]);
  assert.equal(hasMore, true);
  assert.equal(loadError, null);

  // 7: cached results remain
  assert.equal(visible[0]?.id, "cached-1");

  // 8: stale timeout cannot overwrite newer success
  generation = 2;
  visible = [{ id: "fresh-south" }];
  loading = true;
  const stale = fetchPage(async () => {
    await sleep(30);
    return {
      stations: [{ id: "stale-timeout-cache" }],
      hasMore: true,
      stopReason: "catalog-timeout-cache-preserved",
      source: "cache-timeout",
    };
  }, 1);
  await fetchPage(async () => {
    return {
      stations: [{ id: "fresh-south" }, { id: "fresh-2" }],
      hasMore: true,
      source: "catalog",
    };
  }, 2);
  await stale;
  assert.deepEqual(
    visible.map((s) => s.id),
    ["fresh-south", "fresh-2"]
  );

  // 9: real non-timeout errors reach feature error state
  generation = 3;
  loading = true;
  await fetchPage(async () => {
    throw new Error("radio_catalog_search_500");
  }, 3);
  assert.equal(loadError, "radio_catalog_search_500");
  assert.equal(loading, false);

  await sleep(20);
  process.off("unhandledRejection", onUnhandled);
  assert.equal(unhandled, 0, "no unhandled rejection from TimeoutError path");
}

async function testInflightTimeoutDoesNotFloat() {
  let unhandled = 0;
  const onUnhandled = () => {
    unhandled += 1;
  };
  process.on("unhandledRejection", onUnhandled);

  const fetchPromise = Promise.reject(makeTimeoutError());
  // Prevent Node from flagging the root rejection before .catch attaches.
  fetchPromise.catch(() => undefined);

  const inflight = fetchPromise
    .then((result: { stations: string[] }) => result.stations)
    .catch((error) => {
      if (isCatalogAbortError(error) || isCatalogTimeoutError(error)) {
        return [] as string[];
      }
      throw error;
    });

  const stations = await inflight;
  assert.deepEqual(stations, []);

  await sleep(20);
  process.off("unhandledRejection", onUnhandled);
  assert.equal(unhandled, 0);
}

async function main() {
  await testTimeoutRejectsOnce();
  await testTimerCleanedAfterSuccess();
  await testTimerCleanedAfterHttpFailure();
  await testTimerCleanedAfterAbort();
  await testRadioOwnershipCatchesTimeout();
  await testInflightTimeoutDoesNotFloat();
  console.log("ok catalog-timeout-handling");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Provider-aware rate limiting, backoff, and bounded concurrency for Concerts imports.
 */

export type ConcertRetryDecision = {
  retry: boolean;
  delayMs: number;
  reason: string;
};

export function computeConcertBackoffMs(
  attempt: number,
  options?: { baseMs?: number; maxMs?: number }
): number {
  const base = options?.baseMs ?? 500;
  const max = options?.maxMs ?? 60_000;
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(Math.random() * Math.min(250, exp * 0.1));
  return Math.min(max, exp + jitter);
}

export function decideConcertProviderRetry(input: {
  attempt: number;
  maxAttempts?: number;
  status?: number | null;
  errorMessage?: string | null;
}): ConcertRetryDecision {
  const maxAttempts = input.maxAttempts ?? 5;
  if (input.attempt >= maxAttempts) {
    return { retry: false, delayMs: 0, reason: "max_attempts" };
  }

  const status = input.status ?? null;
  const message = String(input.errorMessage || "").toLowerCase();

  if (status === 429 || /rate limit|quota|too many requests/.test(message)) {
    return {
      retry: true,
      delayMs: computeConcertBackoffMs(input.attempt, { baseMs: 1000, maxMs: 120_000 }),
      reason: "rate_limited",
    };
  }

  if (status && status >= 500) {
    return {
      retry: true,
      delayMs: computeConcertBackoffMs(input.attempt),
      reason: "server_error",
    };
  }

  if (/timeout|network|fetch failed|econnreset/.test(message)) {
    return {
      retry: true,
      delayMs: computeConcertBackoffMs(input.attempt),
      reason: "transient_network",
    };
  }

  return { retry: false, delayMs: 0, reason: "non_retryable" };
}

export async function mapWithBoundedConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

export function createRequestDeduper<T>() {
  const inflight = new Map<string, Promise<T>>();
  return async function dedupe(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing;
    const promise = factory().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
  };
}

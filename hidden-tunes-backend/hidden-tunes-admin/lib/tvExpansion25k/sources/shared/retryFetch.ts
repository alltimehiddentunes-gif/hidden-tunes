const RETRY_DELAYS_MS = [0, 2_000, 5_000];

export async function retryFetch(
  url: string,
  init: RequestInit = {},
  attempts = 3
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt] || 5_000));
    }

    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function retryFetchText(url: string, init: RequestInit = {}) {
  const response = await retryFetch(url, init);
  return response.text();
}

export async function retryFetchJson<T>(url: string, init: RequestInit = {}) {
  const response = await retryFetch(url, init);
  return (await response.json()) as T;
}

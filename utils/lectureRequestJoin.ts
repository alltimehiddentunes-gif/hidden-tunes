type LecturePagePayload = Record<string, string | number | boolean | null | undefined>;

export function lecturePageTrace(event: string, payload: LecturePagePayload = {}) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(`[LECTURE_PAGE] ${event}`, payload);
}

const inflight = new Map<string, Promise<unknown>>();

/**
 * One resource key → one in-flight promise. Additional callers join it.
 */
export function joinLectureRequest<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) {
    lecturePageTrace("fetch_joined", { key });
    return existing as Promise<T>;
  }

  lecturePageTrace("fetch_start", { key });
  const promise = factory()
    .then((value) => {
      lecturePageTrace("fetch_success", { key });
      return value;
    })
    .catch((error) => {
      const aborted =
        error instanceof Error &&
        (error.name === "AbortError" || error.message === "Aborted");
      lecturePageTrace(aborted ? "fetch_aborted" : "fetch_error", {
        key,
        error: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    })
    .finally(() => {
      if (inflight.get(key) === promise) {
        inflight.delete(key);
      }
    });

  inflight.set(key, promise);
  return promise;
}

type LecturePagePayload = Record<string, string | number | boolean | null | undefined>;

export function lecturePageTrace(event: string, payload: LecturePagePayload = {}) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(`[LECTURE_PAGE] ${event}`, {
    at: Date.now(),
    ...payload,
  });
}

export function lectureNavTrace(event: string, payload: LecturePagePayload = {}) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(`[LECTURE_NAV] ${event}`, {
    at: Date.now(),
    ...payload,
  });
}

const inflight = new Map<string, Promise<unknown>>();

/**
 * One resource key → one in-flight promise. Additional callers join it.
 * Do not abort shared requests from Strict Mode remount cleanups.
 */
export function joinLectureRequest<T>(
  key: string,
  factory: () => Promise<T>,
  options?: { tracePrefix?: string; payload?: LecturePagePayload }
): Promise<T> {
  const prefix = options?.tracePrefix || "fetch";
  const basePayload = { key, requestKey: key, ...(options?.payload || {}) };
  const existing = inflight.get(key);
  if (existing) {
    lecturePageTrace(`${prefix}_join`, basePayload);
    return existing as Promise<T>;
  }

  lecturePageTrace(`${prefix}_start`, basePayload);
  const promise = factory()
    .then((value) => {
      lecturePageTrace(`${prefix}_success`, basePayload);
      return value;
    })
    .catch((error) => {
      const aborted =
        error instanceof Error &&
        (error.name === "AbortError" || error.message === "Aborted");
      lecturePageTrace(aborted ? `${prefix}_aborted` : `${prefix}_error`, {
        ...basePayload,
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

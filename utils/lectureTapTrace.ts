type LectureTracePayload = Record<
  string,
  string | number | boolean | null | undefined
>;

function safeHost(url?: string | null) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).host || null;
  } catch {
    return null;
  }
}

function hasQueryParams(url?: string | null) {
  const raw = String(url || "").trim();
  if (!raw) return false;
  try {
    return Boolean(new URL(raw).searchParams.toString());
  } catch {
    return raw.includes("?");
  }
}

/** Development-only lecture tap chain tracer. One tapId across all stages. */
export function lectureTrace(
  stage: string,
  tapId: string,
  payload: LectureTracePayload = {}
) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;

  const safe: LectureTracePayload = {
    tapId,
    stage,
    ...payload,
  };

  if (typeof payload.urlHost === "undefined" && payload.hasUrl != null) {
    // no-op placeholder for callers that pass hasUrl only
  }

  console.log(`[LECTURE_TRACE] ${stage}`, safe);
}

export function lectureUrlDiagnostics(url?: string | null) {
  return {
    hasUrl: Boolean(String(url || "").trim()),
    urlHost: safeHost(url),
    hasQueryParams: hasQueryParams(url),
    urlScheme: String(url || "").trim().toLowerCase().startsWith("https")
      ? "https"
      : String(url || "").trim().toLowerCase().startsWith("http")
        ? "http"
        : null,
  };
}

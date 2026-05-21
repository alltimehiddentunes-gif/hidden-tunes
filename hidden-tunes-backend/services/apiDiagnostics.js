const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_REGEX.test(String(value || "").trim());
}

export function sanitizeFilterToken(value, maxLength = 120) {
  return String(value || "")
    .trim()
    .slice(0, maxLength)
    .replace(/[^\w\-.\s%]/gi, "");
}

export function logApiRequest(route, details = {}) {
  console.log(`[HiddenTunes:api] ${route}`, {
    at: Date.now(),
    ...details,
  });
}

export function logApiSuccess(route, details = {}) {
  console.log(`[HiddenTunes:api] ${route}:success`, {
    at: Date.now(),
    ...details,
  });
}

export function logApiWarning(route, details = {}) {
  console.warn(`[HiddenTunes:api] ${route}:warning`, {
    at: Date.now(),
    ...details,
  });
}

export function logApiError(route, details = {}) {
  console.error(`[HiddenTunes:api] ${route}:error`, {
    at: Date.now(),
    ...details,
  });
}

export function logSupabaseError(route, error, context = {}) {
  if (!error) return;

  logApiError(route, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    ...context,
  });
}

export function createRequestTimer() {
  const startedAt = Date.now();

  return {
    durationMs() {
      return Date.now() - startedAt;
    },
  };
}

export function isRelationEmbedError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "");

  return (
    code === "PGRST200" ||
    code === "PGRST201" ||
    message.includes("relationship") ||
    message.includes("embed") ||
    message.includes("could not find")
  );
}

export function isInvalidUuidFilterError(error) {
  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("invalid input syntax for type uuid") ||
    message.includes("invalid uuid") ||
    (message.includes("uuid") && message.includes("invalid"))
  );
}

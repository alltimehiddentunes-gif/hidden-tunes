/**
 * Revalidation interval only (matches backend TV_REVALIDATION_INTERVAL_MS).
 * Overdue checks must NOT hide a previously verified channel.
 */
export const TV_VALIDATION_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;

/** @deprecated Alias — use for queue/priority signalling, never visibility. */
export const TV_REVALIDATION_INTERVAL_MS = TV_VALIDATION_FRESHNESS_MS;

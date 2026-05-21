type PerformanceEventDetails = Record<string, string | number | boolean | undefined>;

function shouldLogPerformance() {
  return typeof __DEV__ === "undefined" || __DEV__;
}

export function nowMs() {
  return Date.now();
}

export function logPerformanceEvent(
  event: string,
  details: PerformanceEventDetails = {}
) {
  if (!shouldLogPerformance()) return;

  console.log("[HiddenTunes:perf]", event, details);
}

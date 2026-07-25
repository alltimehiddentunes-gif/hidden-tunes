/**
 * Development-only content-domain performance diagnostics.
 * Namespace: [HTContentPerformance]
 *
 * Disabled by default (ENABLE_CONTENT_PERF_DIAGNOSTICS). Never logs on every
 * playback-position tick. Throttled + removable.
 */
import { isContentPerfDiagnosticsEnabled } from "./devDiagnostics";

export type ContentPerfDomain =
  | "audiobook"
  | "podcast"
  | "motivational"
  | "lecture"
  | "shared";

export type ContentPerfEvent =
  | "mount"
  | "unmount"
  | "focus"
  | "blur"
  | "render"
  | "request_start"
  | "request_end"
  | "request_cached"
  | "request_aborted"
  | "queue_build"
  | "queue_skip_rebuild"
  | "group"
  | "sort"
  | "sanitize"
  | "artwork_transform"
  | "player_command"
  | "playback_subscription"
  | "listener_cleanup";

type ContentPerfPayload = {
  domain: ContentPerfDomain;
  screen: string;
  event: ContentPerfEvent;
  mountCount?: number;
  renderCount?: number;
  activeRequestCount?: number;
  requestReason?: string;
  requestDurationMs?: number;
  responseItemCount?: number;
  cachedOrNetwork?: "cached" | "network" | "inflight";
  queueBuildCount?: number;
  queueItemCount?: number;
  groupingDurationMs?: number;
  sortingDurationMs?: number;
  sanitizationDurationMs?: number;
  artworkTransformationCount?: number;
  playerCommand?: string;
  playbackSubscriptionCount?: number;
  focused?: boolean;
  [key: string]: string | number | boolean | undefined;
};

const THROTTLE_MS = 1200;
const RENDER_THROTTLE_MS = 4000;
const lastLoggedAt = new Map<string, number>();
const mountCounts = new Map<string, number>();
const renderCounts = new Map<string, number>();
const queueBuildCounts = new Map<string, number>();
let activeRequestCount = 0;

function throttleKey(payload: ContentPerfPayload) {
  return `${payload.domain}|${payload.screen}|${payload.event}|${payload.requestReason || ""}|${payload.playerCommand || ""}`;
}

function shouldLog(payload: ContentPerfPayload) {
  if (!isContentPerfDiagnosticsEnabled()) return false;
  const key = throttleKey(payload);
  const now = Date.now();
  const minGap = payload.event === "render" ? RENDER_THROTTLE_MS : THROTTLE_MS;
  const last = lastLoggedAt.get(key) || 0;
  if (now - last < minGap) return false;
  lastLoggedAt.set(key, now);
  return true;
}

export function contentPerfScreenKey(domain: ContentPerfDomain, screen: string) {
  return `${domain}:${screen}`;
}

export function bumpContentPerfMount(domain: ContentPerfDomain, screen: string) {
  const key = contentPerfScreenKey(domain, screen);
  const next = (mountCounts.get(key) || 0) + 1;
  mountCounts.set(key, next);
  logContentPerformance({
    domain,
    screen,
    event: "mount",
    mountCount: next,
  });
  return next;
}

export function bumpContentPerfUnmount(domain: ContentPerfDomain, screen: string) {
  const key = contentPerfScreenKey(domain, screen);
  logContentPerformance({
    domain,
    screen,
    event: "unmount",
    mountCount: mountCounts.get(key) || 0,
  });
}

export function bumpContentPerfRender(domain: ContentPerfDomain, screen: string) {
  if (!isContentPerfDiagnosticsEnabled()) return 0;
  const key = contentPerfScreenKey(domain, screen);
  const next = (renderCounts.get(key) || 0) + 1;
  renderCounts.set(key, next);
  logContentPerformance({
    domain,
    screen,
    event: "render",
    renderCount: next,
  });
  return next;
}

export function beginContentPerfRequest(
  domain: ContentPerfDomain,
  screen: string,
  reason: string
) {
  activeRequestCount += 1;
  logContentPerformance({
    domain,
    screen,
    event: "request_start",
    activeRequestCount,
    requestReason: reason,
  });
  return Date.now();
}

export function endContentPerfRequest(
  domain: ContentPerfDomain,
  screen: string,
  reason: string,
  startedAt: number,
  details: {
    responseItemCount?: number;
    cachedOrNetwork?: "cached" | "network" | "inflight";
    aborted?: boolean;
  } = {}
) {
  activeRequestCount = Math.max(0, activeRequestCount - 1);
  logContentPerformance({
    domain,
    screen,
    event: details.aborted ? "request_aborted" : "request_end",
    activeRequestCount,
    requestReason: reason,
    requestDurationMs: Math.max(0, Date.now() - startedAt),
    responseItemCount: details.responseItemCount,
    cachedOrNetwork: details.cachedOrNetwork,
  });
}

export function logContentPerfQueueBuild(
  domain: ContentPerfDomain,
  screen: string,
  queueItemCount: number,
  skipped = false
) {
  const key = contentPerfScreenKey(domain, screen);
  const next = skipped ? queueBuildCounts.get(key) || 0 : (queueBuildCounts.get(key) || 0) + 1;
  if (!skipped) queueBuildCounts.set(key, next);
  logContentPerformance({
    domain,
    screen,
    event: skipped ? "queue_skip_rebuild" : "queue_build",
    queueBuildCount: next,
    queueItemCount,
  });
}

export function logContentPerformance(payload: ContentPerfPayload) {
  if (!shouldLog(payload)) return;
  console.log("[HTContentPerformance]", {
    ...payload,
    activeRequestCount:
      payload.activeRequestCount !== undefined
        ? payload.activeRequestCount
        : activeRequestCount,
    timestamp: Date.now(),
  });
}

/** Test/reset helper — clears throttle + counters. */
export function resetContentPerformanceDiagnostics() {
  lastLoggedAt.clear();
  mountCounts.clear();
  renderCounts.clear();
  queueBuildCounts.clear();
  activeRequestCount = 0;
}

export function getContentPerformanceCounters() {
  return {
    activeRequestCount,
    mountCounts: Object.fromEntries(mountCounts),
    renderCounts: Object.fromEntries(renderCounts),
    queueBuildCounts: Object.fromEntries(queueBuildCounts),
  };
}

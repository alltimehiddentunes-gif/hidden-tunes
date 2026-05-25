import { logPerformanceEvent } from "./performanceLogs";

type StartupPhase =
  | "critical"
  | "afterPaint"
  | "afterInteraction"
  | "background"
  | "deferred"
  | "idle";

type StartupTaskRecord = {
  name: string;
  phase: StartupPhase;
  scheduledAt: number;
  completedAt?: number;
  durationMs?: number;
};

const appMountedAt = Date.now();
let firstCachedContentAt: number | null = null;
let firstCachedContentScreen: string | null = null;
let firstApiRefreshAt: number | null = null;
let firstApiRefreshScreen: string | null = null;
let playbackRestoreCompletedAt: number | null = null;

const scheduledTasks = new Map<string, StartupTaskRecord>();
const completedTasks: StartupTaskRecord[] = [];

function shouldTrack() {
  return false;
}

export function markAppMounted(source = "root_layout") {
  if (!shouldTrack()) return;

  logPerformanceEvent("startup_app_mounted", {
    source,
    sinceProcessMs: Date.now() - appMountedAt,
  });
}

export function markFirstCachedContentVisible(screen: string) {
  if (!shouldTrack()) return;
  if (firstCachedContentAt) return;

  firstCachedContentAt = Date.now();
  firstCachedContentScreen = screen;

  logPerformanceEvent("startup_first_cached_content", {
    screen,
    sinceAppMountMs: firstCachedContentAt - appMountedAt,
  });
}

export function markFirstApiRefreshComplete(screen: string, refreshMs: number) {
  if (!shouldTrack()) return;
  if (firstApiRefreshAt) return;

  firstApiRefreshAt = Date.now();
  firstApiRefreshScreen = screen;

  logPerformanceEvent("startup_first_api_refresh", {
    screen,
    refreshMs,
    sinceAppMountMs: firstApiRefreshAt - appMountedAt,
    sinceCachedContentMs: firstCachedContentAt
      ? firstApiRefreshAt - firstCachedContentAt
      : undefined,
  });
}

export function markPlaybackRestoreComplete() {
  if (!shouldTrack()) return;
  if (playbackRestoreCompletedAt) return;

  playbackRestoreCompletedAt = Date.now();

  logPerformanceEvent("startup_playback_restore_complete", {
    sinceAppMountMs: playbackRestoreCompletedAt - appMountedAt,
  });
}

export function recordStartupTaskScheduled(name: string, phase: StartupPhase) {
  if (!shouldTrack()) return;
  if (scheduledTasks.has(name)) return;

  scheduledTasks.set(name, {
    name,
    phase,
    scheduledAt: Date.now(),
  });
}

export function recordStartupTaskComplete(
  name: string,
  phase: StartupPhase,
  durationMs: number
) {
  if (!shouldTrack()) return;

  const existing = scheduledTasks.get(name);
  const completedAt = Date.now();

  const record: StartupTaskRecord = {
    name,
    phase,
    scheduledAt: existing?.scheduledAt || completedAt,
    completedAt,
    durationMs,
  };

  scheduledTasks.delete(name);
  completedTasks.push(record);

  logPerformanceEvent("startup_task_complete", {
    name,
    phase,
    durationMs,
    deferredMs: completedAt - record.scheduledAt,
  });
}

export function resetStartupDiagnostics() {
  firstCachedContentAt = null;
  firstCachedContentScreen = null;
  firstApiRefreshAt = null;
  firstApiRefreshScreen = null;
  playbackRestoreCompletedAt = null;
  scheduledTasks.clear();
  completedTasks.length = 0;
}

export function getStartupDiagnostics() {
  const now = Date.now();

  return {
    appMountedAt,
    appAgeMs: now - appMountedAt,
    firstCachedContentAt,
    firstCachedContentScreen,
    firstCachedContentMs: firstCachedContentAt
      ? firstCachedContentAt - appMountedAt
      : null,
    firstApiRefreshAt,
    firstApiRefreshScreen,
    firstApiRefreshMs: firstApiRefreshAt ? firstApiRefreshAt - appMountedAt : null,
    playbackRestoreCompletedAt,
    playbackRestoreMs: playbackRestoreCompletedAt
      ? playbackRestoreCompletedAt - appMountedAt
      : null,
    scheduledTaskCount: scheduledTasks.size,
    completedTaskCount: completedTasks.length,
    recentCompletedTasks: completedTasks.slice(-6),
  };
}

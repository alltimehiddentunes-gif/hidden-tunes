/**
 * In-memory ScoreBat provider health (process-local).
 */

export type ScoreBatHealthSnapshot = {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  recordsFetched: number;
  recordsAccepted: number;
  recordsRejected: number;
  fixturesCreated: number;
  fixturesUpdated: number;
  broadcastsCreated: number;
  playbackSuccess: number;
  playbackFailure: number;
  lastResponseMs: number | null;
  discoveryPausedUntil: string | null;
};

const health: ScoreBatHealthSnapshot = {
  lastSuccessAt: null,
  lastFailureAt: null,
  consecutiveFailures: 0,
  recordsFetched: 0,
  recordsAccepted: 0,
  recordsRejected: 0,
  fixturesCreated: 0,
  fixturesUpdated: 0,
  broadcastsCreated: 0,
  playbackSuccess: 0,
  playbackFailure: 0,
  lastResponseMs: null,
  discoveryPausedUntil: null,
};

const FAIL_PAUSE_THRESHOLD = 5;
const PAUSE_MS = 15 * 60_000;

export function getScoreBatHealth(): ScoreBatHealthSnapshot {
  return { ...health };
}

export function resetScoreBatHealth() {
  Object.assign(health, {
    lastSuccessAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
    recordsFetched: 0,
    recordsAccepted: 0,
    recordsRejected: 0,
    fixturesCreated: 0,
    fixturesUpdated: 0,
    broadcastsCreated: 0,
    playbackSuccess: 0,
    playbackFailure: 0,
    lastResponseMs: null,
    discoveryPausedUntil: null,
  });
}

export function recordScoreBatDiscoverySuccess(input: {
  fetched: number;
  accepted: number;
  rejected: number;
  responseMs: number;
  fixturesCreated?: number;
  fixturesUpdated?: number;
  broadcastsCreated?: number;
}) {
  health.lastSuccessAt = new Date().toISOString();
  health.consecutiveFailures = 0;
  health.recordsFetched += input.fetched;
  health.recordsAccepted += input.accepted;
  health.recordsRejected += input.rejected;
  health.lastResponseMs = input.responseMs;
  health.fixturesCreated += input.fixturesCreated || 0;
  health.fixturesUpdated += input.fixturesUpdated || 0;
  health.broadcastsCreated += input.broadcastsCreated || 0;
  health.discoveryPausedUntil = null;
}

export function recordScoreBatDiscoveryFailure() {
  health.lastFailureAt = new Date().toISOString();
  health.consecutiveFailures += 1;
  if (health.consecutiveFailures >= FAIL_PAUSE_THRESHOLD) {
    health.discoveryPausedUntil = new Date(Date.now() + PAUSE_MS).toISOString();
  }
}

export function isScoreBatDiscoveryPaused(now = new Date()): boolean {
  if (!health.discoveryPausedUntil) return false;
  return Date.parse(health.discoveryPausedUntil) > now.getTime();
}

export function recordScoreBatPlayback(ok: boolean) {
  if (ok) health.playbackSuccess += 1;
  else health.playbackFailure += 1;
}

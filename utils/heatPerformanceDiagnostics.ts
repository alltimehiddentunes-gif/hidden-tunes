import { isHeavyPerfDiagnosticsEnabled } from './devDiagnostics';

type Details = Record<string, string | number | boolean | null | undefined>;

function shouldLogHeatDiagnostics() {
  return typeof __DEV__ !== 'undefined' && __DEV__ && isHeavyPerfDiagnosticsEnabled();
}

export function logHeatDiagnostic(event: string, details: Details = {}) {
  if (!shouldLogHeatDiagnostics()) return;
  console.log('[HTHeat]', event, {
    at: Date.now(),
    ...details,
  });
}

export function logHeatRequestStart(label: string, details: Details = {}) {
  logHeatDiagnostic('request_start', { label, ...details });
}

export function logHeatRequestComplete(label: string, startedAt: number, details: Details = {}) {
  logHeatDiagnostic('request_complete', {
    label,
    elapsedMs: Math.max(0, Date.now() - startedAt),
    ...details,
  });
}

export function logHeatRequestCancelled(label: string, details: Details = {}) {
  logHeatDiagnostic('request_cancelled', { label, ...details });
}

export function logHeatStaleResult(label: string, details: Details = {}) {
  logHeatDiagnostic('stale_result_ignored', { label, ...details });
}

export function logHeatRender(label: string, count: number, details: Details = {}) {
  if (count <= 1 && !details.force) return;
  logHeatDiagnostic('render_count', { label, count, ...details });
}

/**
 * Phase 2 startup investigation — append-only step log.
 * Does not affect playback; console evidence only.
 */
const STARTUP_TRACE_PREFIX = "[HTStartup]";

const steps: { step: number; label: string; at: number }[] = [];
let stepCounter = 0;

export function traceStartup(label: string, details?: Record<string, unknown>) {
  stepCounter += 1;
  const record = { step: stepCounter, label, at: Date.now() };
  steps.push(record);

  if (details && Object.keys(details).length > 0) {
    console.log(STARTUP_TRACE_PREFIX, `STEP ${record.step}`, label, details);
  } else {
    console.log(STARTUP_TRACE_PREFIX, `STEP ${record.step}`, label);
  }
}

export function getStartupTraceLog() {
  return steps.slice();
}

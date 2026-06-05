import { isHeavyPerfDiagnosticsEnabled } from "./devDiagnostics";

type Details = Record<string, string | number | boolean | undefined>;

function log(event: string, details: Details = {}) {
  if (typeof __DEV__ !== "undefined" && __DEV__ && isHeavyPerfDiagnosticsEnabled()) {
    console.log(event, { at: Date.now(), ...details });
  }
}

export function logPlayerDuplicateSmartControlRemoved(details: Details = {}) {
  log("player_duplicate_smart_control_removed", details);
}

export function logPlayerRepeatControlUnified(details: Details = {}) {
  log("player_repeat_control_unified", details);
}

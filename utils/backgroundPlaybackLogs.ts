import { isVerbosePlaybackDiagnosticsEnabled } from "./devDiagnostics";

type LogDetails = Record<string, string | number | boolean | null | undefined>;

function shouldLog() {
  return isVerbosePlaybackDiagnosticsEnabled();
}

export function logBackgroundPlayback(
  message: string,
  details: LogDetails = {}
) {
  if (!shouldLog()) return;
  console.log(`[HiddenTunes:BG] ${message}`, { at: Date.now(), ...details });
}

export function logTrackPlayerQueue(
  message: string,
  details: LogDetails = {}
) {
  if (!shouldLog()) return;
  console.log(`[HiddenTunes:Queue] ${message}`, { at: Date.now(), ...details });
}

export function logTrackPlayerBg(
  message: string,
  details: LogDetails = {}
) {
  if (!shouldLog()) return;
  console.log(`[HiddenTunes:TrackPlayer] ${message}`, { at: Date.now(), ...details });
}

export function captureDevStackTrace(maxLines = 6): string | undefined {
  if (!shouldLog()) return undefined;

  const stack = new Error("stack").stack;
  if (!stack) return undefined;

  return stack.split("\n").slice(1, maxLines + 1).join("\n");
}

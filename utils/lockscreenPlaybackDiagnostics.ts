type DiagnosticDetails = Record<string, unknown>;

type DiagnosticMemory = {
  lastUserAction: string;
  lastNativeEvent: string;
  lastRemoteCommand: string;
  lastBridgeEvent: string;
  lastAudioFocusOrInterruption: string;
};

const memory: DiagnosticMemory = {
  lastUserAction: "none",
  lastNativeEvent: "none",
  lastRemoteCommand: "none",
  lastBridgeEvent: "none",
  lastAudioFocusOrInterruption: "none",
};

function timestamp() {
  return new Date().toISOString();
}

function rememberValue(value: string) {
  return `${value}@${timestamp()}`;
}

export function rememberLockscreenDiagnostic(
  key: keyof DiagnosticMemory,
  value: string
) {
  memory[key] = rememberValue(value);
}

export function getLockscreenDiagnosticSnapshot(): DiagnosticMemory {
  return { ...memory };
}

export function logLockscreenPlaybackDiagnostic(
  event: string,
  details: DiagnosticDetails = {}
) {
  console.log(`[HTLockscreenDiag] ${event}`, {
    ...details,
    timestamp: timestamp(),
  });
}

export function logAndRememberLockscreenDiagnostic(
  event: string,
  details: DiagnosticDetails = {},
  remember?: Partial<Record<keyof DiagnosticMemory, string>>
) {
  if (remember) {
    for (const [key, value] of Object.entries(remember)) {
      if (value) {
        memory[key as keyof DiagnosticMemory] = rememberValue(value);
      }
    }
  }

  logLockscreenPlaybackDiagnostic(event, details);
}

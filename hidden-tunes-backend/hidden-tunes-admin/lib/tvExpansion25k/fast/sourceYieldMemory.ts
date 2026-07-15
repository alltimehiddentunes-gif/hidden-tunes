export type SourceYieldSnapshot = {
  sourceId: string;
  raw: number;
  unique: number;
  prefilterRejected: number;
  verificationAttempted: number;
  verificationPassed: number;
  verificationFailed: number;
  passRate: number;
  terminalFailureRate: number;
  at: string;
};

const rolling = new Map<string, SourceYieldSnapshot>();
const DECAY = 0.55;

function blendNumber(previous: number, next: number) {
  if (previous <= 0) return next;
  if (next <= 0) return previous * DECAY;
  return previous * DECAY + next * (1 - DECAY);
}

export function recordSourceYield(snapshot: SourceYieldSnapshot) {
  const previous = rolling.get(snapshot.sourceId);
  if (!previous) {
    rolling.set(snapshot.sourceId, snapshot);
    return;
  }

  const verificationAttempted = Math.round(
    blendNumber(previous.verificationAttempted, snapshot.verificationAttempted)
  );
  const verificationPassed = Math.round(
    blendNumber(previous.verificationPassed, snapshot.verificationPassed)
  );
  const verificationFailed = Math.round(
    blendNumber(previous.verificationFailed, snapshot.verificationFailed)
  );
  const passRate =
    verificationAttempted > 0 ? verificationPassed / verificationAttempted : snapshot.passRate;

  rolling.set(snapshot.sourceId, {
    ...snapshot,
    raw: Math.round(blendNumber(previous.raw, snapshot.raw)),
    unique: Math.round(blendNumber(previous.unique, snapshot.unique)),
    prefilterRejected: Math.round(
      blendNumber(previous.prefilterRejected, snapshot.prefilterRejected)
    ),
    verificationAttempted,
    verificationPassed,
    verificationFailed,
    passRate,
    terminalFailureRate:
      verificationAttempted > 0
        ? Math.min(1, snapshot.terminalFailureRate * (1 - DECAY) + previous.terminalFailureRate * DECAY)
        : snapshot.terminalFailureRate,
  });
}

export function getSourceYield(sourceId: string) {
  return rolling.get(sourceId);
}

export function listSourceYields() {
  return [...rolling.values()];
}

export function clearSourceYields() {
  rolling.clear();
}

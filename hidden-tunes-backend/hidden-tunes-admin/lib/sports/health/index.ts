export type SportsHealthSnapshot = {
  providerStatus: string;
  streamReliability: number;
  consecutiveFailures: number;
  quarantined: boolean;
};

export function summarizeSportsHealth(input: {
  providerStatus?: string | null;
  reliabilityScore?: number | null;
  consecutiveFailures?: number | null;
  quarantinedAt?: string | null;
}): SportsHealthSnapshot {
  return {
    providerStatus: input.providerStatus || "unknown",
    streamReliability: Math.max(0, Math.min(100, Number(input.reliabilityScore ?? 100))),
    consecutiveFailures: Math.max(0, Number(input.consecutiveFailures ?? 0)),
    quarantined: Boolean(input.quarantinedAt),
  };
}

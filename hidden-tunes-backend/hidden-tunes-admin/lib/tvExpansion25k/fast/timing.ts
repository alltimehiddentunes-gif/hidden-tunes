export type TvBatchTimingReport = {
  totalMs: number;
  sourceFetchMs: number;
  normalizationMs: number;
  dedupeMs: number;
  verificationMs: number;
  databaseMs: number;
  promotionMs: number;
  sleepMs: number;
  candidatesProcessed: number;
  uniqueCandidates: number;
  verificationChecks: number;
  databaseRoundTrips: number;
};

export class TvBatchTimer {
  private marks = new Map<string, number>();
  private totals = new Map<string, number>();
  readonly startedAt = Date.now();

  mark(label: string) {
    this.marks.set(label, Date.now());
  }

  add(label: string, ms: number) {
    this.totals.set(label, (this.totals.get(label) || 0) + ms);
  }

  elapsedSince(label: string) {
    const start = this.marks.get(label);
    if (!start) return 0;
    return Date.now() - start;
  }

  close(label: string) {
    const start = this.marks.get(label);
    if (!start) return;
    this.add(label, Date.now() - start);
    this.marks.delete(label);
  }

  report(stats: Partial<TvBatchTimingReport>): TvBatchTimingReport {
    const totalMs = Date.now() - this.startedAt;
    return {
      totalMs,
      sourceFetchMs: this.totals.get("sourceFetch") || 0,
      normalizationMs: this.totals.get("normalization") || 0,
      dedupeMs: this.totals.get("dedupe") || 0,
      verificationMs: this.totals.get("verification") || 0,
      databaseMs: this.totals.get("database") || 0,
      promotionMs: this.totals.get("promotion") || 0,
      sleepMs: this.totals.get("sleep") || 0,
      candidatesProcessed: stats.candidatesProcessed || 0,
      uniqueCandidates: stats.uniqueCandidates || 0,
      verificationChecks: stats.verificationChecks || 0,
      databaseRoundTrips: stats.databaseRoundTrips || 0,
    };
  }
}

export function throughputPerMinute(count: number, durationMs: number) {
  if (durationMs <= 0) return 0;
  return (count / durationMs) * 60_000;
}

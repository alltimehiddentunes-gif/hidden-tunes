import { planTvStationRecovery, toTvRecoveryDryRunRecord } from "@/lib/tvRecovery/engine";
import type { TvRecoveryProviderRegistry } from "@/lib/tvRecovery/providerRegistry";
import type {
  TvRecoveryAuditEvent,
  TvRecoveryPatch,
  TvRecoveryPlan,
  TvRecoveryProbe,
  TvRecoveryStation,
} from "@/lib/tvRecovery/types";

export const TV_RECOVERY_DEFAULT_BATCH_SIZE = 25;
export const TV_RECOVERY_DEFAULT_CONCURRENCY = 3;
export const TV_RECOVERY_DEFAULT_INTERVAL_MS = 6 * 60 * 60_000;

export type TvRecoveryBatch = {
  stations: TvRecoveryStation[];
  nextCursor: string | null;
  done: boolean;
};

export interface TvRecoveryRepository {
  loadBatch(input: { cursor: string | null; limit: number }): Promise<TvRecoveryBatch>;
  loadDuplicateContext(): Promise<TvRecoveryStation[]>;
  updateStation(input: {
    stationId: string;
    expectedUpdatedAt: string | null;
    patch: TvRecoveryPatch;
  }): Promise<void>;
  appendAudit(events: TvRecoveryAuditEvent[]): Promise<void>;
  invalidateCache(): Promise<string>;
}

export function nextTvRecoveryRunAt(input: {
  lastRunAt: string | null;
  nowMs?: number;
  intervalMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const intervalMs = Math.max(60_000, input.intervalMs ?? TV_RECOVERY_DEFAULT_INTERVAL_MS);
  const lastRunMs = input.lastRunAt ? Date.parse(input.lastRunAt) : Number.NaN;
  if (!Number.isFinite(lastRunMs)) return new Date(nowMs).toISOString();
  return new Date(Math.max(nowMs, lastRunMs + intervalMs)).toISOString();
}

export async function retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    maxRetries: number;
    baseBackoffMs: number;
    sleep: (ms: number) => Promise<void>;
  }
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= options.maxRetries) break;
      await options.sleep(options.baseBackoffMs * 2 ** attempt);
    }
  }
  throw lastError;
}

class ProviderCooldownGate {
  private readonly nextAllowed = new Map<string, number>();
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly nowMs: () => number,
    private readonly sleep: (ms: number) => Promise<void>
  ) {}

  async wait(providerId: string, cooldownMs: number) {
    if (cooldownMs <= 0) return;
    const previous = this.locks.get(providerId) || Promise.resolve();
    const current = previous.then(async () => {
      const remaining = Math.max(0, (this.nextAllowed.get(providerId) || 0) - this.nowMs());
      if (remaining > 0) await this.sleep(remaining);
      this.nextAllowed.set(providerId, this.nowMs() + cooldownMs);
    });
    this.locks.set(providerId, current.catch(() => undefined));
    await current;
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function patchHasChanges(patch: TvRecoveryPatch) {
  return Object.keys(patch).length > 0;
}

export async function runTvRecoveryWorker(input: {
  repository: TvRecoveryRepository;
  registry: TvRecoveryProviderRegistry;
  probe: TvRecoveryProbe;
  dryRun?: boolean;
  cursor?: string | null;
  batchSize?: number;
  concurrency?: number;
  maxBatches?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  refreshProviders?: boolean;
}) {
  const dryRun = input.dryRun !== false;
  const batchSize = Math.max(1, Math.min(100, input.batchSize || TV_RECOVERY_DEFAULT_BATCH_SIZE));
  const concurrency = Math.max(
    1,
    Math.min(4, input.concurrency || TV_RECOVERY_DEFAULT_CONCURRENCY)
  );
  const maxBatches = Math.max(1, Math.min(1_000, input.maxBatches || 1));
  const maxRetries = Math.max(0, Math.min(5, input.maxRetries ?? 2));
  const baseBackoffMs = Math.max(0, input.baseBackoffMs ?? 500);
  const now = input.now || (() => new Date());
  const sleep = input.sleep || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const cooldown = new ProviderCooldownGate(() => now().getTime(), sleep);
  const context = await input.repository.loadDuplicateContext();
  const contextById = new Map(context.map((station) => [station.id, station]));
  const plans: TvRecoveryPlan[] = [];
  const errors: Array<{ stationId: string; message: string }> = [];
  let cursor = input.cursor || null;
  let batches = 0;
  let done = false;
  let attempted = 0;
  let applied = 0;

  while (batches < maxBatches && !done) {
    const batch = await input.repository.loadBatch({ cursor, limit: batchSize });
    batches += 1;
    attempted += batch.stations.length;
    for (const station of batch.stations) contextById.set(station.id, station);
    const allStations = [...contextById.values()];

    const batchProviders = new Map<string, number>();
    for (const station of batch.stations) {
      const identity = input.registry.identify(station);
      if (!identity) continue;
      const provider = input.registry.getProvider(identity.providerId);
      if (provider) batchProviders.set(provider.id, provider.cooldownMs);
    }
    await Promise.all(
      [...batchProviders].map(([providerId, cooldownMs]) =>
        cooldown.wait(providerId, cooldownMs)
      )
    );

    const batchPlans = await mapWithConcurrency(batch.stations, concurrency, async (station) => {
      try {
        return await retryWithBackoff(
          () =>
            planTvStationRecovery({
              station,
              allStations,
              registry: input.registry,
              probe: input.probe,
              nowIso: now().toISOString(),
              refreshProvider: input.refreshProviders !== false,
            }),
          { maxRetries, baseBackoffMs, sleep }
        );
      } catch (error) {
        errors.push({
          stationId: station.id,
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    });

    for (const plan of batchPlans) {
      if (!plan) continue;
      plans.push(plan);
      if (dryRun || !patchHasChanges(plan.patch)) continue;
      const station = contextById.get(plan.stationId);
      if (!station) continue;
      await input.repository.updateStation({
        stationId: plan.stationId,
        expectedUpdatedAt: station.updated_at,
        patch: plan.patch,
      });
      contextById.set(plan.stationId, { ...station, ...plan.patch } as TvRecoveryStation);
      applied += 1;
    }

    cursor = batch.nextCursor;
    done = batch.done || batch.stations.length === 0;
  }

  const auditEvents: TvRecoveryAuditEvent[] = plans.map((plan) => ({
    at: now().toISOString(),
    stationId: plan.stationId,
    action: plan.action,
    applied: !dryRun && patchHasChanges(plan.patch),
    summary: toTvRecoveryDryRunRecord(plan),
  }));
  let cacheInvalidation = "not_run";
  if (!dryRun && applied > 0) {
    await input.repository.appendAudit(auditEvents);
    cacheInvalidation = await input.repository.invalidateCache();
  }

  return {
    dryRun,
    attempted,
    planned: plans.length,
    applied,
    batches,
    nextCursor: cursor,
    done,
    concurrency,
    reviewQueue: plans.filter((plan) => plan.action === "queue_inactive_review"),
    plans,
    auditEvents,
    errors,
    cacheInvalidation,
  };
}

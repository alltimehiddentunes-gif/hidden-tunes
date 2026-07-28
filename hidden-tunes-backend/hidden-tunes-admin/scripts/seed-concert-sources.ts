/**
 * Seed curated official Concerts sources into concert_sources.
 *
 * Usage:
 *   npx tsx scripts/seed-concert-sources.ts --dry-run
 *   npx tsx scripts/seed-concert-sources.ts
 *
 * Dry-run validates only (no DB writes).
 * Live seed requires DATABASE / Supabase env and must not be pointed at production casually.
 */

import {
  auditCuratedConcertSourceRegistry,
  getCuratedConcertSources,
} from "../lib/concerts/sourceRegistry";
import { listBatch2WaveSourceSeeds } from "../lib/concerts/expansion/batch2SourceWave";
import { upsertConcertSource } from "../lib/concerts/sourceRepository";
import type { ConcertSourceSeed } from "../lib/concerts/types";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const includeWave = !process.argv.includes("--curated-only");
  const audit = auditCuratedConcertSourceRegistry();

  const wave = includeWave ? listBatch2WaveSourceSeeds() : [];
  const byKey = new Map<string, ConcertSourceSeed>();
  for (const source of [...getCuratedConcertSources(), ...wave]) {
    byKey.set(source.stableKey, source);
  }
  const sources = [...byKey.values()];

  const summary = {
    dry_run: dryRun,
    curated_total: audit.total,
    wave_total: wave.length,
    merged_total: sources.length,
    ok: audit.ok,
    enabled: audit.enabledCount,
    disabled: audit.disabledCount,
    import_enabled: audit.importEnabledCount,
    by_provider_type: audit.byProviderType,
    by_country: audit.byCountry,
    by_authorization: audit.byAuthorization,
    by_embed_policy: audit.byEmbedPolicy,
    error_count: audit.errors.length,
    warning_count: audit.warnings.length,
    errors: audit.errors.slice(0, 20),
    warnings: audit.warnings.slice(0, 20),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!audit.ok) {
    throw new Error(`Registry validation failed with ${audit.errors.length} error(s).`);
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        { success: true, dry_run: true, wrote: 0, would_write: sources.length },
        null,
        2
      )
    );
    return;
  }

  let wrote = 0;
  let skipped = 0;
  const failures: Array<{ key: string; error: string }> = [];
  for (const source of sources) {
    try {
      await upsertConcertSource(source);
      wrote += 1;
    } catch (error) {
      skipped += 1;
      failures.push({
        key: source.stableKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        success: failures.length === 0,
        dry_run: false,
        wrote,
        skipped,
        failures: failures.slice(0, 30),
      },
      null,
      2
    )
  );
  if (wrote === 0 && failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

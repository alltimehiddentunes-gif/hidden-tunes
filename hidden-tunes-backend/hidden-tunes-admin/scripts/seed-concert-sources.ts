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
import { upsertConcertSource } from "../lib/concerts/sourceRepository";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const audit = auditCuratedConcertSourceRegistry();

  const summary = {
    dry_run: dryRun,
    total: audit.total,
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
    console.log(JSON.stringify({ success: true, dry_run: true, wrote: 0 }, null, 2));
    return;
  }

  const sources = getCuratedConcertSources();
  let wrote = 0;
  for (const source of sources) {
    await upsertConcertSource(source);
    wrote += 1;
  }

  console.log(JSON.stringify({ success: true, dry_run: false, wrote }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

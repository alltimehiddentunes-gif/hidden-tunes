/**
 * Audit curated Concerts source registry (no DB writes).
 * Run: npx tsx scripts/audit-concert-sources.ts
 */

import { auditCuratedConcertSourceRegistry } from "../lib/concerts/sourceRegistry";

const audit = auditCuratedConcertSourceRegistry();

console.log(
  JSON.stringify(
    {
      total: audit.total,
      ok: audit.ok,
      enabled: audit.enabledCount,
      disabled: audit.disabledCount,
      import_enabled: audit.importEnabledCount,
      by_provider_type: audit.byProviderType,
      by_country: audit.byCountry,
      by_authorization: audit.byAuthorization,
      by_embed_policy: audit.byEmbedPolicy,
      errors: audit.errors,
      warnings: audit.warnings,
      stable_keys: audit.sources.map((s) => s.stableKey),
    },
    null,
    2
  )
);

if (!audit.ok) process.exit(1);

/**
 * Bounded Sports live broadcast validation worker.
 *
 * Usage:
 *   npx tsx scripts/run-sports-validate-live-broadcasts.ts [--dry-run] [--limit=50] [--provider=scorebat] [--fixture=UUID] [--country=US] [--platform=ios]
 *
 * Selection: events live now OR starting within 30 minutes; candidate/stale broadcasts; provider enabled.
 * Default batch: 50. Dry-run performs no writes.
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";
import { getScoreBatRuntimeConfig } from "../lib/sports/providers/scorebat/config";
import { validateScoreBatEmbed } from "../lib/sports/providers/scorebat/embedSafety";
import { validateSportsBroadcast } from "../lib/sports/playback/validateBroadcast";
import { syncFixturePlayability } from "../lib/sports/playback/playabilitySync";
import { recordSportsMetric } from "../lib/sports/playback/metrics";

type Args = {
  dryRun: boolean;
  limit: number;
  provider?: string;
  fixture?: string;
  country?: string;
  platform: "ios" | "android" | "web";
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    dryRun: false,
    limit: 50,
    platform: "ios",
  };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--limit=")) {
      out.limit = Math.min(50, Math.max(1, Number(a.slice(8)) || 50));
    } else if (a.startsWith("--provider=")) out.provider = a.slice(11);
    else if (a.startsWith("--fixture=")) out.fixture = a.slice(10);
    else if (a.startsWith("--country=")) out.country = a.slice(10);
    else if (a.startsWith("--platform=")) {
      const p = a.slice(11);
      if (p === "ios" || p === "android" || p === "web") out.platform = p;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 60_000);

  console.log(
    JSON.stringify({
      worker: "sports:validate-live-broadcasts",
      dryRun: args.dryRun,
      limit: args.limit,
      provider: args.provider || null,
      fixture: args.fixture || null,
    })
  );

  let fixtureQuery = supabaseAdmin
    .from("sports_fixtures")
    .select("id, status, starts_at, ends_at")
    .eq("visible", true)
    .limit(args.limit);

  if (args.fixture) {
    fixtureQuery = fixtureQuery.eq("id", args.fixture);
  } else {
    fixtureQuery = fixtureQuery.or(
      `status.eq.live,and(starts_at.lte.${soon.toISOString()},starts_at.gte.${now.toISOString()}),and(starts_at.lte.${now.toISOString()},or(ends_at.is.null,ends_at.gte.${now.toISOString()}))`
    );
  }

  const { data: fixtures, error: fixErr } = await fixtureQuery;
  if (fixErr) {
    console.error("fixture_query_failed", fixErr.message);
    process.exit(1);
  }

  const fixtureIds = (fixtures || []).map((f) => f.id);
  if (fixtureIds.length === 0) {
    console.log(JSON.stringify({ processed: 0, note: "no_fixtures" }));
    return;
  }

  let broadcastQuery = supabaseAdmin
    .from("sports_broadcasts")
    .select("*")
    .in("fixture_id", fixtureIds)
    .is("unpublished_at", null)
    .is("quarantined_at", null)
    .in("validation_status", [
      "candidate",
      "validating",
      "validated",
      "degraded",
      "failed",
    ])
    .limit(args.limit);

  const { data: broadcasts, error: bErr } = await broadcastQuery;
  if (bErr) {
    console.error("broadcast_query_failed", bErr.message);
    process.exit(1);
  }

  let processed = 0;
  let validated = 0;
  let failed = 0;
  const touchedFixtures = new Set<string>();

  for (const b of broadcasts || []) {
    if (processed >= args.limit) break;

    const { data: provider } = b.provider_id
      ? await supabaseAdmin
          .from("sports_providers")
          .select("id, slug, is_enabled, kill_switch, health_status")
          .eq("id", b.provider_id)
          .maybeSingle()
      : { data: null };

    if (
      !provider ||
      !provider.is_enabled ||
      provider.kill_switch ||
      provider.health_status === "disabled"
    ) {
      continue;
    }
    if (args.provider && provider.slug !== args.provider) continue;

    const meta = (b.metadata || {}) as { embedUrl?: string; validatedEmbedUrl?: string };
    const { data: source } = await supabaseAdmin
      .from("sports_stream_sources")
      .select("web_fallback_url, resolver_reference")
      .eq("broadcast_id", b.id)
      .order("priority", { ascending: true })
      .limit(1)
      .maybeSingle();

    const embedRaw =
      meta.validatedEmbedUrl ||
      meta.embedUrl ||
      source?.web_fallback_url ||
      source?.resolver_reference ||
      null;

    let assetProof = {
      exists: false,
      embedContractOk: false,
      reason: "unsupported_provider",
    };
    if (provider.slug === "scorebat") {
      const cfg = getScoreBatRuntimeConfig();
      if (!cfg.enabled) continue;
      const v = validateScoreBatEmbed(String(embedRaw || ""));
      assetProof = {
        exists: v.ok,
        embedContractOk: v.ok,
        reason: v.ok ? undefined : v.reason,
      } as typeof assetProof;
      if (v.ok) meta.validatedEmbedUrl = v.embedUrl;
    }

    const result = validateSportsBroadcast({
      providerId: provider.slug,
      providerEnabled: provider.is_enabled,
      providerKillSwitch: provider.kill_switch,
      providerStatus: provider.health_status,
      providerAssetId: b.provider_asset_id,
      playbackKind: b.playback_kind || "iframe",
      embedUrlOrHtml: embedRaw,
      isOfficial: b.is_official,
      isEmbeddable: b.is_embeddable,
      mobileSupported: b.mobile_supported,
      webSupported: b.web_supported,
      requiresSubscription: b.requires_subscription || b.subscription_required,
      countryAllowlist: b.country_allowlist || [],
      countryBlocklist: b.country_blocklist || [],
      fixtureId: b.fixture_id,
      countryCode: args.country,
      platform: args.platform,
      assetProof,
      recentFailureCount: b.failure_count,
      endsAt: provider.slug === "scorebat" ? null : b.ends_at,
      ttlMs:
        // live: ~2m; starting within 30m: ~5m
        String(b.broadcast_type).startsWith("live")
          ? 2 * 60_000
          : 5 * 60_000,
    });

    processed += 1;
    if (result.status === "validated") validated += 1;
    else failed += 1;

    console.log(
      JSON.stringify({
        broadcastId: b.id,
        fixtureId: b.fixture_id,
        status: result.status,
        healthScore: result.healthScore,
        reason: result.reason || null,
        dryRun: args.dryRun,
      })
    );

    if (args.dryRun) continue;

    await supabaseAdmin
      .from("sports_broadcasts")
      .update({
        validation_status:
          result.status === "validated"
            ? "validated"
            : result.status === "blocked"
              ? "blocked"
              : result.status === "expired"
                ? "expired"
                : "failed",
        health_score: result.healthScore,
        last_validated_at: result.checkedAt,
        validation_expires_at: result.expiresAt,
        failure_count:
          result.status === "validated"
            ? 0
            : Number(b.failure_count || 0) + 1,
        metadata: {
          ...(b.metadata || {}),
          ...(meta.validatedEmbedUrl
            ? { validatedEmbedUrl: meta.validatedEmbedUrl }
            : {}),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", b.id);

    await supabaseAdmin.from("sports_playback_validations").insert({
      broadcast_id: b.id,
      provider_id: b.provider_id,
      checked_at: result.checkedAt,
      status: result.status,
      asset_exists: result.assetExists ?? null,
      embed_allowed: result.embedAllowed ?? null,
      mobile_supported: result.mobileSupported ?? null,
      country_result: result.countryResult ?? null,
      failure_reason: result.reason ?? null,
      response_metadata: { host: result.host || null },
    });

    await recordSportsMetric(
      result.status === "validated"
        ? "validation_successes"
        : "validation_failures",
      1,
      b.provider_id
    );

    if (b.fixture_id) touchedFixtures.add(b.fixture_id);
  }

  if (!args.dryRun) {
    for (const fid of touchedFixtures) {
      await syncFixturePlayability(fid);
    }
  }

  console.log(
    JSON.stringify({
      processed,
      validated,
      failed,
      fixturesSynced: args.dryRun ? 0 : touchedFixtures.size,
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

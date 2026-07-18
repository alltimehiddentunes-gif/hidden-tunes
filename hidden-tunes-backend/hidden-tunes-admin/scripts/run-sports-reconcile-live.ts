/**
 * Bounded Sports live reconciliation:
 * - mark overdue fixtures finished
 * - sync playability from validated broadcasts
 * - quarantine placeholder / example.com broadcasts
 * - hide test competition fixtures from playable browse (visible=false)
 *
 * Usage:
 *   npx tsx scripts/run-sports-reconcile-live.ts [--dry-run] [--limit=100]
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";
import { isPlaceholderSportsUrl } from "../lib/sports/catalogFilter";
import {
  computeSportsEffectiveLiveState,
  finishedFixtureStatusForPersist,
} from "../lib/sports/liveState";
import { syncFixturePlayability } from "../lib/sports/playback/playabilitySync";

type Args = { dryRun: boolean; limit: number };

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, limit: 100 };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--limit=")) {
      out.limit = Math.min(500, Math.max(1, Number(a.slice(8)) || 100));
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const report = {
    worker: "sports:reconcile-live",
    dryRun: args.dryRun,
    markedFinished: 0,
    playabilitySynced: 0,
    broadcastsQuarantined: 0,
    testFixturesHidden: 0,
    errors: [] as string[],
  };

  console.log(JSON.stringify({ started: true, ...args }));

  // 1) Overdue / stale live fixtures
  const { data: liveFixtures, error: liveErr } = await supabaseAdmin
    .from("sports_fixtures")
    .select("id, status, starts_at, ends_at, sport_id, title, visible")
    .eq("status", "live")
    .eq("visible", true)
    .limit(args.limit);
  if (liveErr) {
    console.error(liveErr.message);
    process.exit(1);
  }

  const sportIds = [
    ...new Set(
      (liveFixtures || []).map((f) => f.sport_id).filter(Boolean) as string[]
    ),
  ];
  const sportSlugById = new Map<string, string>();
  if (sportIds.length) {
    const { data: sports } = await supabaseAdmin
      .from("sports")
      .select("id, slug")
      .in("id", sportIds);
    for (const s of sports || []) sportSlugById.set(s.id, s.slug);
  }

  for (const fixture of liveFixtures || []) {
    try {
      const sportSlug = sportSlugById.get(fixture.sport_id) || null;
      const finished = finishedFixtureStatusForPersist({
        fixtureStatus: fixture.status,
        startsAt: fixture.starts_at,
        endsAt: fixture.ends_at,
        sportSlug,
        now,
      });
      const liveState = computeSportsEffectiveLiveState({
        fixtureStatus: fixture.status,
        startsAt: fixture.starts_at,
        endsAt: fixture.ends_at,
        sportSlug,
        now,
      });

      if (finished || !liveState.effectiveLive) {
        if (!args.dryRun) {
          await supabaseAdmin
            .from("sports_fixtures")
            .update({
              status: finished || "completed",
              playable: false,
              availability_state: "finished",
              playability_updated_at: now.toISOString(),
            })
            .eq("id", fixture.id);
        }
        report.markedFinished += 1;
        continue;
      }

      if (!args.dryRun) {
        await syncFixturePlayability(fixture.id);
      }
      report.playabilitySynced += 1;
    } catch (err) {
      report.errors.push(
        `${fixture.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 2) Quarantine placeholder broadcasts
  const { data: broadcasts } = await supabaseAdmin
    .from("sports_broadcasts")
    .select("id, publisher_domain, metadata, quarantined_at")
    .is("quarantined_at", null)
    .limit(args.limit);

  for (const b of broadcasts || []) {
    const domain = String(b.publisher_domain || "").toLowerCase();
    const meta = (b.metadata || {}) as Record<string, unknown>;
    const urls = [
      meta.official_url,
      meta.officialUrl,
      meta.embed_url,
      meta.url,
      meta.watch_url,
    ]
      .map((v) => String(v || ""))
      .filter(Boolean);
    const bad =
      domain.includes("example.com") ||
      domain.includes("example.org") ||
      urls.some((u) => isPlaceholderSportsUrl(u));
    if (!bad) continue;
    if (!args.dryRun) {
      await supabaseAdmin
        .from("sports_broadcasts")
        .update({
          quarantined_at: now.toISOString(),
          availability_status: "quarantined",
          metadata: {
            ...meta,
            quarantine_reason: "placeholder_url",
          },
        })
        .eq("id", b.id);
    }
    report.broadcastsQuarantined += 1;
  }

  // 3) Hide fixtures under test competitions
  const { data: testComps } = await supabaseAdmin
    .from("sports_competitions")
    .select("id, name, slug")
    .or("name.ilike.%(Test)%,slug.ilike.pilot-%");

  const testCompIds = (testComps || []).map((c) => c.id);
  if (testCompIds.length) {
    if (!args.dryRun) {
      const { data: hidden } = await supabaseAdmin
        .from("sports_fixtures")
        .update({
          visible: false,
          playable: false,
          availability_state: "live_unavailable",
          playability_updated_at: now.toISOString(),
        })
        .in("competition_id", testCompIds)
        .eq("visible", true)
        .select("id");
      report.testFixturesHidden = (hidden || []).length;
    } else {
      const { count } = await supabaseAdmin
        .from("sports_fixtures")
        .select("id", { count: "exact", head: true })
        .in("competition_id", testCompIds)
        .eq("visible", true);
      report.testFixturesHidden = count || 0;
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

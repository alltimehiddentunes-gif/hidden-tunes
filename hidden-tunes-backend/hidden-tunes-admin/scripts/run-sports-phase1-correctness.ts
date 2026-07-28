/**
 * Dry-run / optional apply for Phase 1 Sports correctness mutations.
 * Default: dry-run only. Never enables sports_enabled.
 *
 * Usage:
 *   npx tsx scripts/run-sports-phase1-correctness.ts
 *   npx tsx scripts/run-sports-phase1-correctness.ts --apply-stale-live
 *   npx tsx scripts/run-sports-phase1-correctness.ts --apply-broadcast-quarantine
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnvLocal();

const url = String(process.env.SUPABASE_URL || "").trim();
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const applyStale = process.argv.includes("--apply-stale-live");
const applyBc = process.argv.includes("--apply-broadcast-quarantine");
const outDir = path.join(process.cwd(), "data", "sports-phase1-correctness");
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  const now = new Date().toISOString();
  const { data: liveRows, error: liveErr } = await sb
    .from("sports_fixtures")
    .select("id,title,status,starts_at,ends_at,availability_state,playable,metadata")
    .eq("status", "live");
  if (liveErr) throw liveErr;

  const stale = (liveRows || []).filter(
    (r) => r.ends_at && Date.parse(r.ends_at) < Date.now()
  );

  const { data: broadcasts, error: bcErr } = await sb
    .from("sports_broadcasts")
    .select(
      "id,fixture_id,publisher_name,broadcast_type,is_official,verification_status,validation_status,quarantined_at,metadata"
    )
    .is("quarantined_at", null)
    .limit(2000);
  if (bcErr) throw bcErr;

  const unsafe = (broadcasts || []).filter((b) => {
    const pub = String(b.publisher_name || "");
    const source = String((b.metadata as { source?: string } | null)?.source || "");
    const org = String(
      (b.metadata as { officialOrganization?: string } | null)?.officialOrganization ||
        ""
    );
    const allowPub = new Set([
      "FIBA Basketball",
      "FIBA 3x3",
      "World Surf League",
      "AFL",
      "Asian Cricket Council",
    ]);
    if (/iptv|Free-TV/i.test(pub) || /iptv/i.test(source)) return true;
    if (/TV Catalog Sports Bridge|Wave4 Sports/i.test(pub)) return true;
    if (/sports_worldwide_expansion/i.test(source)) return true;
    if (b.is_official === true && !org && !allowPub.has(pub)) return true;
    return false;
  });

  const report = {
    generatedAt: now,
    mode: {
      applyStaleLive: applyStale,
      applyBroadcastQuarantine: applyBc,
    },
    staleLive: {
      count: stale.length,
      ids: stale.map((r) => r.id),
      rows: stale,
    },
    unsafeBroadcasts: {
      count: unsafe.length,
      byPublisher: Object.fromEntries(
        Object.entries(
          unsafe.reduce<Record<string, number>>((acc, b) => {
            const k = String(b.publisher_name || "(null)");
            acc[k] = (acc[k] || 0) + 1;
            return acc;
          }, {})
        ).sort((a, b) => b[1] - a[1])
      ),
    },
    featureFlagsCheck: null as unknown,
  };

  const { data: flags } = await sb
    .from("sports_feature_flags")
    .select("key,enabled")
    .in("key", ["sports_enabled", "sports_live_scores_enabled"]);
  report.featureFlagsCheck = flags;

  fs.writeFileSync(
    path.join(outDir, "dry-run-mutation-report.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));

  if (applyStale) {
    console.log("APPLY stale-live…");
    for (const row of stale) {
      const meta = {
        ...((row.metadata as object) || {}),
        phase1_stale_live_finalized_at: now,
        phase1_previous_status: "live",
        phase1_finalization_reason: "stale_live_past_ends_at_no_score_inferred",
      };
      const { error } = await sb
        .from("sports_fixtures")
        .update({
          status: "completed",
          availability_state: "finished",
          playable: false,
          metadata: meta,
          updated_at: now,
        })
        .eq("id", row.id)
        .eq("status", "live");
      if (error) console.error(row.id, error.message);
      else console.log("finalized", row.id);
    }
  } else {
    console.log("Dry-run only for stale-live (pass --apply-stale-live to mutate).");
  }

  if (applyBc) {
    console.log("APPLY broadcast quarantine…");
    for (const b of unsafe) {
      const meta = {
        ...((b.metadata as object) || {}),
        phase1_quarantine_at: now,
        phase1_quarantine_reason: "unsafe_or_unproven_event_stream",
        phase1_previous_is_official: b.is_official,
        phase1_previous_verification_status: b.verification_status,
      };
      const { error } = await sb
        .from("sports_broadcasts")
        .update({
          quarantined_at: now,
          is_official: false,
          verification_status: "failed",
          validation_status: "blocked",
          availability_status: "quarantined",
          metadata: meta,
          updated_at: now,
        })
        .eq("id", b.id)
        .is("quarantined_at", null);
      if (error) console.error(b.id, error.message);
    }
    console.log("quarantined", unsafe.length);
  } else {
    console.log(
      "Dry-run only for broadcasts (pass --apply-broadcast-quarantine to mutate)."
    );
  }

  // Always re-check flags remain off
  const { data: flagsAfter } = await sb
    .from("sports_feature_flags")
    .select("key,enabled")
    .in("key", ["sports_enabled", "sports_live_scores_enabled"]);
  console.log("FLAGS AFTER:", flagsAfter);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

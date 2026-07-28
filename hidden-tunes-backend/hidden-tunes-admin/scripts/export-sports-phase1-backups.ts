/**
 * Export Phase 1 production backups via service role (no secrets in files).
 * Run: npx tsx scripts/export-sports-phase1-backups.ts
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
if (!url.includes("kojcyswxfuikxmqntwye")) {
  console.error("Refusing backup: unexpected Supabase project", url);
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const outDir = path.join(
  process.cwd(),
  "data",
  "sports-phase1-production-apply",
  "backups"
);
fs.mkdirSync(outDir, { recursive: true });

function write(name: string, data: unknown) {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  console.log("wrote", name);
}

async function main() {
  const stamp = new Date().toISOString();

  const { data: flags } = await sb
    .from("sports_feature_flags")
    .select("*")
    .order("key");
  write("before-sports-feature-flags.json", { stamp, rows: flags });

  const { data: live } = await sb
    .from("sports_fixtures")
    .select("*")
    .eq("status", "live");
  const stale = (live || []).filter(
    (r) => r.ends_at && Date.parse(r.ends_at) < Date.now()
  );
  write("before-stale-live-fixtures.json", {
    stamp,
    liveCount: (live || []).length,
    staleCount: stale.length,
    rows: stale,
  });

  const { data: playability } = await sb
    .from("sports_fixtures")
    .select(
      "id,status,playable,availability_state,visible,starts_at,ends_at,updated_at,metadata"
    )
    .or("status.eq.live,playable.eq.true")
    .limit(500);
  write("before-playability-state.json", { stamp, rows: playability });

  // Fetch all broadcasts in pages for unsafe filter
  const allBc: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 2000; offset += 200) {
    const { data, error } = await sb
      .from("sports_broadcasts")
      .select("*")
      .range(offset, offset + 199);
    if (error) throw error;
    if (!data?.length) break;
    allBc.push(...data);
    if (data.length < 200) break;
  }

  const allowPub = new Set([
    "FIBA Basketball",
    "FIBA 3x3",
    "World Surf League",
    "AFL",
    "Asian Cricket Council",
  ]);
  const unsafe = allBc.filter((b) => {
    const pub = String(b.publisher_name || "");
    const meta = (b.metadata || {}) as Record<string, unknown>;
    const source = String(meta.source || "");
    const org = String(meta.officialOrganization || "");
    if (/iptv|Free-TV/i.test(pub) || /iptv/i.test(source)) return true;
    if (/TV Catalog Sports Bridge|Wave4 Sports/i.test(pub)) return true;
    if (/sports_worldwide_expansion/i.test(source)) return true;
    if (b.is_official === true && !org && !allowPub.has(pub)) return true;
    return false;
  });

  write("before-unsafe-broadcasts.json", {
    stamp,
    totalBroadcasts: allBc.length,
    unsafeCount: unsafe.length,
    byPublisher: Object.fromEntries(
      Object.entries(
        unsafe.reduce<Record<string, number>>((acc, b) => {
          const k = String(b.publisher_name || "(null)");
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {})
      ).sort((a, b) => b[1] - a[1])
    ),
    rows: unsafe,
  });

  // Counts snapshot
  async function count(table: string, filter?: string) {
    let q = sb.from(table).select("id", { count: "exact", head: true });
    // simple eq filters only via separate calls in caller
    void filter;
    const { count: c } = await q;
    return c ?? 0;
  }

  const { count: totalFixtures } = await sb
    .from("sports_fixtures")
    .select("id", { count: "exact", head: true });
  const { count: quarantined } = await sb
    .from("sports_fixtures")
    .select("id", { count: "exact", head: true })
    .eq("status", "quarantined");
  const { count: liveCount } = await sb
    .from("sports_fixtures")
    .select("id", { count: "exact", head: true })
    .eq("status", "live");
  const { count: playable } = await sb
    .from("sports_fixtures")
    .select("id", { count: "exact", head: true })
    .eq("playable", true);
  const { count: broadcasts } = await sb
    .from("sports_broadcasts")
    .select("id", { count: "exact", head: true });

  write("before-counts.json", {
    stamp,
    totalFixtures,
    quarantined,
    live: liveCount,
    staleLive: stale.length,
    playable,
    broadcasts,
    unsafeBroadcasts: unsafe.length,
    flags: flags?.map((f) => ({ key: f.key, enabled: f.enabled })),
  });

  // Rollback SQL template
  const rollback = `-- Rollback template generated ${stamp}
-- Restore stale-live fixtures from before-stale-live-fixtures.json
-- Restore broadcasts from before-unsafe-broadcasts.json
-- Prefer using sports_phase1_*_backup tables if migration applied and APPLY scripts used them.

-- Example fixture restore (replace values from backup JSON):
-- update public.sports_fixtures set status = '<previous_status>', availability_state = '<prev>', playable = <prev>, metadata = '<prev>'::jsonb, updated_at = now() where id = '<id>';

-- Example broadcast restore:
-- update public.sports_broadcasts set quarantined_at = null, is_official = true, verification_status = 'verified', validation_status = '<prev>', availability_status = '<prev>', metadata = '<prev>'::jsonb, updated_at = now() where id = '<id>';
`;
  fs.writeFileSync(path.join(outDir, "ROLLBACK.md"), rollback);
  console.log(
    JSON.stringify(
      {
        stamp,
        stale: stale.length,
        unsafe: unsafe.length,
        totalFixtures,
        live: liveCount,
        broadcasts,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

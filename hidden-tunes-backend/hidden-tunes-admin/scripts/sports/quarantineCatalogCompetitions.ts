/**
 * Quarantine IPTV / TV-catalog competitions from public Sports browse.
 * Does not delete source rows — sets status to quarantined and soft-hides fixtures.
 *
 * Run via: npx tsx scripts/sports/quarantineCatalogCompetitions.ts
 * (from hidden-tunes-admin, with SUPABASE env loaded)
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE URL or service role key");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const CATALOG_NAME_RE =
  /iptv[\s_-]?org|tv\s*catalog|sports\s*bridge|free[\s_-]?tv\s*iptv/i;
const CATALOG_SLUG_RE =
  /(^|-)(iptv|free-tv-playlist|tv-catalog|sports-bridge|ww-iptv)(-|$)/i;

async function main() {
  const { data: comps, error } = await sb
    .from("sports_competitions")
    .select("id, name, slug, status")
    .limit(5000);
  if (error) throw error;

  const bad = (comps || []).filter(
    (c) =>
      CATALOG_NAME_RE.test(String(c.name || "")) ||
      CATALOG_SLUG_RE.test(String(c.slug || ""))
  );

  console.log(`Found ${bad.length} catalog competitions to quarantine`);
  for (const c of bad.slice(0, 20)) {
    console.log(` - ${c.id} | ${c.slug} | ${c.name} | ${c.status}`);
  }

  if (!bad.length) {
    console.log("Nothing to quarantine");
    return;
  }

  const ids = bad.map((c) => c.id);
  const { error: qErr } = await sb
    .from("sports_competitions")
    .update({ status: "quarantined" })
    .in("id", ids);
  if (qErr) throw qErr;

  // Soft-hide fixtures tied to those competitions (keep rows for audit).
  const { data: fixtures, error: fErr } = await sb
    .from("sports_fixtures")
    .select("id")
    .in("competition_id", ids)
    .limit(10000);
  if (fErr) throw fErr;

  const fixtureIds = (fixtures || []).map((f) => f.id);
  console.log(`Soft-hiding ${fixtureIds.length} fixtures`);

  // Chunk updates
  for (let i = 0; i < fixtureIds.length; i += 200) {
    const chunk = fixtureIds.slice(i, i + 200);
    const { error: uErr } = await sb
      .from("sports_fixtures")
      .update({
        status: "unavailable",
        playable: false,
        availability_state: "finished",
        metadata: { quarantined_reason: "catalog_not_fixture" },
      })
      .in("id", chunk);
    if (uErr) {
      // metadata merge may fail if column expects jsonb merge — fall back status only
      console.warn("Fixture update with metadata failed, status-only:", uErr.message);
      const { error: u2 } = await sb
        .from("sports_fixtures")
        .update({
          status: "unavailable",
          playable: false,
          availability_state: "finished",
        })
        .in("id", chunk);
      if (u2) throw u2;
    }
  }

  console.log("Done. Catalog competitions quarantined.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

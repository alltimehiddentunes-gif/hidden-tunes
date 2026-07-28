/**
 * Extra curated seeds for remaining zero/thin African countries.
 *   npx tsx scripts/run-radio-africa-zero-country-seeds.ts --execute
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { getAfricanCountry } from "@/lib/radioAfricaExpansion/africanCountries";
import {
  getQueueEntry,
  loadAfricaRadioQueue,
  saveAfricaRadioQueue,
} from "@/lib/radioAfricaExpansion/queue";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  findExistingRadioStationId,
  insertNewRadioStationOnly,
} from "@/lib/radioExpansion25k/insertOnlyImport";
import {
  buildRadioStationFingerprint,
  cleanRadioText,
  getHomepageHost,
  normalizeRadioName,
  normalizeRadioUrl,
  type NormalizedRadioStation,
} from "@/lib/radioNormalization";
import { RADIO_PUBLIC_RELIABILITY_THRESHOLD } from "@/lib/radioPublicCatalog";
import {
  applyRadioVerificationProbe,
  probeRadioStream,
} from "@/lib/radioStreamVerification";

const adminRoot = path.resolve(__dirname, "..");

type Seed = { code: string; name: string; url: string; attribution: string };

/** Only probe-verified or official-host streams — no guessed Zeno mounts. */
const SEEDS: Seed[] = [
  { code: "SZ", name: "SBIS Channel 1", url: "https://zas3.ndx.co.za:8002/stream", attribution: "ndx.co.za" },
  { code: "SZ", name: "SBIS Channel 3", url: "https://zas3.ndx.co.za:8042/stream", attribution: "ndx.co.za" },
  { code: "GN", name: "Espace FM Guinee", url: "https://stream1.svrdedicado.org:7188/stream", attribution: "espacefm" },
  { code: "GN", name: "Soleil FM Guinee", url: "http://stream.radiojar.com/7cu7t0tnr68uv", attribution: "radiojar" },
  { code: "ST", name: "RNSTP Radio Nacional", url: "https://radios2.justweb.pt:8086/stream", attribution: "rn-stp.com" },
  { code: "SO", name: "BBC Somali", url: "https://stream.live.vc.bbcmedia.co.uk/bbc_somali_radio", attribution: "bbc" },
  { code: "BF", name: "Pulsar Ouagadougou", url: "https://pulsarouagadougou.ice.infomaniak.ch/pulsarouagadougou-128.mp3", attribution: "infomaniak" },
];

function hashId(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 32);
}

function build(seed: Seed): NormalizedRadioStation | null {
  const country = getAfricanCountry(seed.code);
  if (!country) return null;
  const sourceStreamUrl = normalizeRadioUrl(seed.url, { stream: true });
  const normalizedStreamUrl = normalizeRadioUrl(sourceStreamUrl, { stream: true }).toLowerCase();
  const cleanedName = cleanRadioText(seed.name, 300);
  const normalizedName = normalizeRadioName(cleanedName);
  if (!sourceStreamUrl || !normalizedStreamUrl || !cleanedName || !normalizedName) return null;
  const now = new Date().toISOString();
  const sourceStationId = `curated_${seed.code.toLowerCase()}_${hashId(normalizedStreamUrl)}`;
  return {
    name: cleanedName,
    normalized_name: normalizedName,
    station_fingerprint: buildRadioStationFingerprint({
      normalized_stream_url: normalizedStreamUrl,
      normalized_name: normalizedName,
      country_code: seed.code,
      normalized_homepage_host: null,
    }),
    fingerprint_version: 1,
    source_name: "radio_browser",
    source_type: "radio_browser",
    source_uuid: sourceStationId,
    source_station_id: sourceStationId,
    source_station_uuid: sourceStationId,
    source_server: `hidden_tunes_trusted_catalog:${seed.attribution}`,
    source_stream_url: sourceStreamUrl,
    stream_url: sourceStreamUrl,
    normalized_stream_url: normalizedStreamUrl,
    homepage_url: null,
    normalized_homepage_host: getHomepageHost(null),
    favicon_url: null,
    country: country.name,
    country_code: seed.code,
    state: null,
    language: null,
    tags: [country.name.toLowerCase(), "curated"],
    bitrate: null,
    codec: null,
    votes: null,
    click_count: null,
    category_slug: "global",
    categories: ["global"],
    source_payload_hash: hashId(`${cleanedName}|${normalizedStreamUrl}`),
    source_last_seen_at: now,
    is_active: true,
    last_checked_at: now,
  };
}

async function main() {
  loadAdminEnv(adminRoot);
  const execute = process.argv.includes("--execute");
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const harvestPath = path.join(
    adminRoot,
    "data/radio-africa-reports/radio-garden-harvest-candidates.json"
  );
  const harvested: Seed[] = fs.existsSync(harvestPath)
    ? (
        JSON.parse(fs.readFileSync(harvestPath, "utf8").replace(/^\uFEFF/, "")) as Seed[]
      ).filter((s) => s?.code && s?.url && s?.name)
    : [];

  const all = [...SEEDS, ...harvested];
  const seen = new Set<string>();
  const unique = all.filter((s) => {
    const key = `${s.code}|${s.url.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results = [];
  let imported = 0;
  let failed = 0;
  let duplicates = 0;

  for (const seed of unique) {
    const candidate = build(seed);
    if (!candidate) {
      failed += 1;
      results.push({ ...seed, outcome: "normalize_failed" });
      continue;
    }
    const probe = await probeRadioStream(candidate.stream_url, {
      timeoutMs: 12000,
      maxRedirects: 5,
      maxPlaylistBytes: 128 * 1024,
      maxReadBytes: 24 * 1024,
    });
    if (!probe.playable) {
      failed += 1;
      results.push({ ...seed, outcome: "probe_failed", reason: probe.outcome });
      continue;
    }
    const existing = await findExistingRadioStationId(supabase, candidate);
    if (existing) {
      duplicates += 1;
      results.push({ ...seed, outcome: "duplicate", id: existing.id });
      continue;
    }
    if (!execute) {
      imported += 1;
      results.push({ ...seed, outcome: "dry_run_would_insert" });
      continue;
    }
    const inserted = await insertNewRadioStationOnly(supabase, candidate, { dryRun: false });
    if (inserted.outcome !== "inserted" || !inserted.stationId) {
      failed += 1;
      results.push({ ...seed, outcome: inserted.outcome, error: inserted.error });
      continue;
    }
    const update = applyRadioVerificationProbe(
      { id: inserted.stationId, reliability_score: 0, consecutive_failures: 0 } as never,
      probe
    );
    await supabase
      .from("radio_stations")
      .update({
        ...update,
        delivery_mode: candidate.stream_url.startsWith("https://") ? "direct_https" : "backend_relay",
        resolved_stream_url: probe.finalUrl || candidate.stream_url,
      })
      .eq("id", inserted.stationId);
    imported += 1;
    results.push({ ...seed, outcome: "imported", id: inserted.stationId });

    const queue = loadAfricaRadioQueue(adminRoot);
    const entry = getQueueEntry(queue, seed.code);
    if (entry) {
      entry.imported += 1;
      const { count } = await supabase
        .from("radio_stations")
        .select("id", { count: "exact", head: true })
        .eq("country_code", seed.code)
        .eq("status", "approved")
        .eq("is_active", true)
        .eq("is_verified", true)
        .eq("playback_status", "playable")
        .eq("is_mature", false)
        .is("quarantined_at", null)
        .is("disabled_at", null)
        .gte("reliability_score", RADIO_PUBLIC_RELIABILITY_THRESHOLD);
      entry.public_playable_total = count || entry.public_playable_total;
      entry.last_completed_at = new Date().toISOString();
      saveAfricaRadioQueue(adminRoot, queue);
    }
  }

  const out = {
    mode: execute ? "execute" : "dry-run",
    imported,
    failed,
    duplicates,
    results,
    finished_at: new Date().toISOString(),
  };
  const outPath = path.join(adminRoot, "data/radio-africa-reports/africa-zero-country-seeds-report.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ outPath, imported, failed, duplicates }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

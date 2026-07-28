/**
 * Second-pass Nigeria official stream retries with corrected Atunwa mounts.
 *   npx tsx scripts/run-radio-africa-ng-pass2.ts --execute
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { insertNewRadioStationOnly, findExistingRadioStationId } from "@/lib/radioExpansion25k/insertOnlyImport";
import {
  buildRadioStationFingerprint,
  cleanRadioText,
  getHomepageHost,
  normalizeRadioName,
  normalizeRadioUrl,
  type NormalizedRadioStation,
} from "@/lib/radioNormalization";
import { applyRadioVerificationProbe, probeRadioStream } from "@/lib/radioStreamVerification";
import { getQueueEntry, loadAfricaRadioQueue, saveAfricaRadioQueue } from "@/lib/radioAfricaExpansion/queue";

const adminRoot = path.resolve(__dirname, "..");

const SEEDS = [
  { name: "Nigeria Info Lagos 99.3", url: "https://nigeriainfofmlagos993-atunwadigital.streamguys1.com/nigeriainfofmlagos993" },
  { name: "The Beat 99.9 Lagos", url: "https://beat999fmlagos-atunwadigital.streamguys1.com/beat999fmlagos" },
  { name: "Lagos Talks 91.3 FM", url: "https://lagostalks913fm-atunwadigital.streamguys1.com/lagostalks913fm" },
  { name: "Cool FM Abuja 96.9", url: "https://coolfmabuja969-atunwadigital.streamguys1.com/coolfmabuja969" },
  { name: "Wazobia FM Abuja 99.5", url: "https://wazobiafmabuja995-atunwadigital.streamguys1.com/wazobiafmabuja995" },
  { name: "Nigeria Info Abuja 95.1", url: "https://nigeriainfoabuja951-atunwadigital.streamguys1.com/nigeriainfoabuja951" },
  { name: "Wazobia FM Port Harcourt 94.1", url: "https://wazobiafmph941-atunwadigital.streamguys1.com/wazobiafmph941" },
  { name: "Cool FM Port Harcourt 95.9", url: "https://coolfmph959-atunwadigital.streamguys1.com/coolfmph959" },
  { name: "Classic FM Lagos 97.3", url: "https://classicfm973lagos-atunwadigital.streamguys1.com/classicfm973lagos" },
  { name: "Rhythm 93.7 FM Lagos", url: "https://rhythm937fmlagos-atunwadigital.streamguys1.com/rhythm937fmlagos" },
  { name: "Smooth 98.1 FM Lagos", url: "https://smooth981fmlagos-atunwadigital.streamguys1.com/smooth981fmlagos" },
  { name: "Inspiration 92.3 FM Lagos", url: "https://inspiration923fmlagos-atunwadigital.streamguys1.com/inspiration923fmlagos" },
  { name: "MAX 102.3 FM Lagos", url: "https://max1023fmlagos-atunwadigital.streamguys1.com/max1023fmlagos" },
  { name: "Cool FM Kano", url: "https://coolfmkano-atunwadigital.streamguys1.com/coolfmkano" },
  { name: "Wazobia FM Kano", url: "https://wazobiafmkano-atunwadigital.streamguys1.com/wazobiafmkano" },
  { name: "Beat FM Ibadan", url: "https://beatfmibadan-atunwadigital.streamguys1.com/beatfmibadan" },
  { name: "Beat FM Port Harcourt", url: "https://beatfmph-atunwadigital.streamguys1.com/beatfmph" },
  { name: "Classic FM Port Harcourt", url: "https://classicfmph-atunwadigital.streamguys1.com/classicfmph" },
  { name: "Splash FM Ibadan", url: "https://splashfmibadan-atunwadigital.streamguys1.com/splashfmibadan" },
  { name: "Fresh 105.9 FM Ibadan", url: "https://fresh1059fmibadan-atunwadigital.streamguys1.com/fresh1059fmibadan" },
  { name: "Agidigbo 88.7 FM", url: "https://agidigbo887fm-atunwadigital.streamguys1.com/agidigbo887fm" },
  { name: "Raypower FM Abuja", url: "https://raypowerabuja-atunwadigital.streamguys1.com/raypowerabuja" },
  { name: "Liberty Radio Abuja", url: "https://libertyradioabuja-atunwadigital.streamguys1.com/libertyradioabuja" },
  { name: "Human Rights Radio Brekete", url: "https://humanrightsradio-atunwadigital.streamguys1.com/humanrightsradio" },
];

function hashId(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 32);
}

function build(name: string, url: string): NormalizedRadioStation | null {
  const sourceStreamUrl = normalizeRadioUrl(url, { stream: true });
  const normalizedStreamUrl = normalizeRadioUrl(sourceStreamUrl, { stream: true }).toLowerCase();
  const cleanedName = cleanRadioText(name, 300);
  const normalizedName = normalizeRadioName(cleanedName);
  if (!sourceStreamUrl || !normalizedStreamUrl || !cleanedName || !normalizedName) return null;
  const now = new Date().toISOString();
  const sourceStationId = `curated_ng_${hashId(normalizedStreamUrl)}`;
  return {
    name: cleanedName,
    normalized_name: normalizedName,
    station_fingerprint: buildRadioStationFingerprint({
      normalized_stream_url: normalizedStreamUrl,
      normalized_name: normalizedName,
      country_code: "NG",
      normalized_homepage_host: null,
    }),
    fingerprint_version: 1,
    source_name: "radio_browser",
    source_type: "radio_browser",
    source_uuid: sourceStationId,
    source_station_id: sourceStationId,
    source_station_uuid: sourceStationId,
    source_server: "hidden_tunes_trusted_catalog:atunwa-pass2",
    source_stream_url: sourceStreamUrl,
    stream_url: sourceStreamUrl,
    normalized_stream_url: normalizedStreamUrl,
    homepage_url: null,
    normalized_homepage_host: getHomepageHost(null),
    favicon_url: null,
    country: "Nigeria",
    country_code: "NG",
    state: null,
    language: null,
    tags: ["nigeria", "curated"],
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
  const results = [];
  let imported = 0;
  let playable = 0;
  let failed = 0;
  let duplicates = 0;

  for (const seed of SEEDS) {
    const candidate = build(seed.name, seed.url);
    if (!candidate) {
      failed += 1;
      results.push({ name: seed.name, outcome: "normalize_failed" });
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
      results.push({ name: seed.name, outcome: "probe_failed", reason: probe.outcome, url: seed.url });
      continue;
    }
    playable += 1;
    const existing = await findExistingRadioStationId(supabase, candidate);
    if (existing) {
      duplicates += 1;
      results.push({ name: seed.name, outcome: "duplicate", id: existing.id });
      continue;
    }
    if (!execute) {
      imported += 1;
      results.push({ name: seed.name, outcome: "dry_run_would_insert", url: seed.url });
      continue;
    }
    const inserted = await insertNewRadioStationOnly(supabase, candidate, { dryRun: false });
    if (inserted.outcome !== "inserted" || !inserted.stationId) {
      results.push({ name: seed.name, outcome: inserted.outcome, error: inserted.error });
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
        delivery_mode: "direct_https",
        resolved_stream_url: probe.finalUrl || candidate.stream_url,
      })
      .eq("id", inserted.stationId);
    imported += 1;
    results.push({ name: seed.name, outcome: "imported_playable", id: inserted.stationId, url: seed.url });
  }

  const { count: publicCount } = await supabase
    .from("radio_stations")
    .select("id", { count: "exact", head: true })
    .eq("country_code", "NG")
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable")
    .eq("is_mature", false)
    .is("quarantined_at", null)
    .is("disabled_at", null)
    .gte("reliability_score", 60);

  const queue = loadAfricaRadioQueue(adminRoot);
  const entry = getQueueEntry(queue, "NG");
  if (entry) {
    entry.imported += imported;
    entry.duplicates += duplicates;
    entry.rejected += failed;
    entry.public_playable_total = publicCount || entry.public_playable_total;
    entry.discovery_status = "completed";
    entry.last_completed_at = new Date().toISOString();
    entry.notes = [...(entry.notes || []), `ng_pass2 imported=${imported} playable_probes=${playable} failed=${failed}`];
    saveAfricaRadioQueue(adminRoot, queue);
  }

  const out = {
    mode: execute ? "execute" : "dry-run",
    imported,
    playable_probes: playable,
    failed,
    duplicates,
    public_playable_total: publicCount || 0,
    results,
  };
  const outPath = path.join(adminRoot, "data/radio-africa-reports/ng-pass2-import-report.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ outPath, summary: { imported, playable, failed, duplicates, public: publicCount } }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

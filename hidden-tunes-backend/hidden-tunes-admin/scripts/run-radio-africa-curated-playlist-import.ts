/**
 * Import lawful playlist-discovered Radio stations for one African country.
 * Uses existing normalize → dedupe → insert → probe verification path.
 *
 *   npx tsx scripts/run-radio-africa-curated-playlist-import.ts --country GH --execute
 *   npx tsx scripts/run-radio-africa-curated-playlist-import.ts --country NG --execute
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
import {
  applyRadioVerificationProbe,
  probeRadioStream,
} from "@/lib/radioStreamVerification";

const adminRoot = path.resolve(__dirname, "..");

type PlaylistEntry = {
  name: string;
  streamUrl: string;
  sourceAttribution: string;
};

const GHANA_SEED: PlaylistEntry[] = [
  { name: "Citi FM 97.3", streamUrl: "https://citi973fm.radioca.st/", sourceAttribution: "citifmonline.com / radioca" },
  { name: "Peace FM", streamUrl: "https://peacefm-atunwadigital.streamguys1.com/peacefm", sourceAttribution: "peacefmonline.com / atunwa" },
  { name: "Kessben FM 93.3 Kumasi", streamUrl: "https://kessben933fmkumasi-atunwadigital.streamguys1.com/kessben933fmkumasi", sourceAttribution: "kessbenfm.com / atunwa" },
  { name: "Okay FM", streamUrl: "https://okayfm-atunwadigital.streamguys1.com/okayfm", sourceAttribution: "atunwa" },
  { name: "Radio Gold", streamUrl: "https://radiogold-atunwadigital.streamguys1.com/radiogold", sourceAttribution: "atunwa" },
  { name: "Ghana Music Radio", streamUrl: "https://streaming.radio.co/s92f890821/listen", sourceAttribution: "radio.co" },
  { name: "Oman FM", streamUrl: "https://omanfm-atunwadigital.streamguys1.com/omanfm", sourceAttribution: "atunwa" },
  { name: "Starr FM", streamUrl: "https://starrfm-atunwadigital.streamguys1.com/starrfm", sourceAttribution: "atunwa" },
  { name: "Y FM 107.9 Accra", streamUrl: "https://yfm1079accra-atunwadigital.streamguys1.com/yfm1079accra", sourceAttribution: "atunwa" },
  { name: "3FM", streamUrl: "https://3fm-atunwadigital.streamguys1.com/3fm", sourceAttribution: "atunwa" },
  { name: "Onua FM", streamUrl: "https://onuafm-atunwadigital.streamguys1.com/onuafm", sourceAttribution: "atunwa" },
  { name: "Fox FM", streamUrl: "https://foxfm-atunwadigital.streamguys1.com/foxfm", sourceAttribution: "atunwa" },
  { name: "Neat FM", streamUrl: "https://neatfm-atunwadigital.streamguys1.com/neatfm", sourceAttribution: "atunwa" },
  { name: "Pure FM 95.7", streamUrl: "https://purefm-atunwadigital.streamguys1.com/purefm", sourceAttribution: "atunwa" },
  { name: "Class FM 91.3", streamUrl: "https://classfm-atunwadigital.streamguys1.com/classfm", sourceAttribution: "classfmonline.com / atunwa" },
  { name: "Akoma FM", streamUrl: "https://akomafm-atunwadigital.streamguys1.com/akomafm", sourceAttribution: "atunwa" },
  { name: "Hot FM 93.9", streamUrl: "https://hot939fm-atunwadigital.streamguys1.com/hot939fm", sourceAttribution: "atunwa" },
  { name: "Agoo FM 96.9", streamUrl: "https://agoofm-atunwadigital.streamguys1.com/agoofm", sourceAttribution: "atunwa" },
  { name: "Hello FM", streamUrl: "https://hellofm-atunwadigital.streamguys1.com/hellofm", sourceAttribution: "atunwa" },
  { name: "Happy FM 98.9 Accra", streamUrl: "https://happyfm989accra-atunwadigital.streamguys1.com/happyfm989accra", sourceAttribution: "atunwa" },
  { name: "Connect FM", streamUrl: "https://connectfm-atunwadigital.streamguys1.com/connectfm", sourceAttribution: "atunwa" },
  { name: "Empire FM", streamUrl: "https://empirefm-atunwadigital.streamguys1.com/empirefm", sourceAttribution: "atunwa" },
  { name: "Sporty FM", streamUrl: "https://sportyfm-atunwadigital.streamguys1.com/sportyfm", sourceAttribution: "atunwa" },
  { name: "DLFM 106.9", streamUrl: "https://dlfm1069-atunwadigital.streamguys1.com/dlfm1069", sourceAttribution: "atunwa" },
  { name: "Opemsuo FM", streamUrl: "https://opemsuofm-atunwadigital.streamguys1.com/opemsuofm", sourceAttribution: "atunwa" },
  { name: "Bside FM", streamUrl: "https://bsidefm-atunwadigital.streamguys1.com/bsidefm", sourceAttribution: "atunwa" },
  { name: "Radio 360", streamUrl: "https://radio360-atunwadigital.streamguys1.com/radio360", sourceAttribution: "atunwa" },
  { name: "Municipal FM", streamUrl: "https://municipalfm-atunwadigital.streamguys1.com/municipalfm", sourceAttribution: "atunwa" },
  { name: "EBS Radio 95.7 FM", streamUrl: "https://ebsradio957fm-atunwadigital.streamguys1.com/ebsradio957fm", sourceAttribution: "atunwa" },
  { name: "Accra FM", streamUrl: "https://accrafm-atunwadigital.streamguys1.com/accrafm", sourceAttribution: "atunwa" },
  { name: "Promise FM 102.7", streamUrl: "https://promisefm-atunwadigital.streamguys1.com/promisefm", sourceAttribution: "atunwa" },
  { name: "Angel FM", streamUrl: "https://atunwadigital.streamguys1.com/angelfm", sourceAttribution: "atunwa" },
  { name: "Kasapa FM", streamUrl: "https://atunwadigital.streamguys1.com/kasapafm", sourceAttribution: "atunwa" },
  { name: "Kente Radio", streamUrl: "https://streamer.radio.co/s362651905/listen", sourceAttribution: "radio.co" },
  { name: "Sounds Of Africa", streamUrl: "https://listen.radioking.com/radio/549848/stream/609065", sourceAttribution: "radioking" },
  { name: "Wonder Radio", streamUrl: "https://radio.localstreamgh.com/listen/wonder_radio/radio.mp3", sourceAttribution: "localstreamgh" },
  { name: "Inspiration Radio", streamUrl: "https://radio.localstreamgh.com/listen/inspirational_radio_/radio.mp3", sourceAttribution: "localstreamgh" },
  { name: "Radio247 90.3 FM", streamUrl: "https://radio.localstreamgh.com/listen/radio247/radio.mp3", sourceAttribution: "localstreamgh" },
  { name: "Kiss 99.9 FM", streamUrl: "https://mars.streamerr.co/8082/stream", sourceAttribution: "streamerr" },
  { name: "Kapital Radio", streamUrl: "https://shoutcast.k-planet.eu/8012/stream", sourceAttribution: "k-planet" },
];

const NIGERIA_SEED: PlaylistEntry[] = [
  { name: "Cool FM Lagos 96.9", streamUrl: "https://coolfmlagos969-atunwadigital.streamguys1.com/coolfmlagos969", sourceAttribution: "coolfm.ng / atunwa" },
  { name: "Wazobia FM Lagos 95.1", streamUrl: "https://wazobiafmlagos951-atunwadigital.streamguys1.com/wazobiafmlagos951", sourceAttribution: "wazobiafm.com / atunwa" },
  { name: "Nigeria Info Lagos 99.3", streamUrl: "https://nigeriainfofmlagos993-atunwadigital.streamguys1.com/nigeriainfofmlagos993", sourceAttribution: "atunwa / tingfm" },
  { name: "Classic FM Lagos 97.3", streamUrl: "https://classicfmlagos973-atunwadigital.streamguys1.com/classicfmlagos973", sourceAttribution: "atunwa" },
  { name: "The Beat 99.9 Lagos", streamUrl: "https://beat999fmlagos-atunwadigital.streamguys1.com/beat999fmlagos", sourceAttribution: "atunwa" },
  { name: "Lagos Talks 91.3", streamUrl: "https://lagostalks913fm-atunwadigital.streamguys1.com/lagostalks913fm", sourceAttribution: "atunwa" },
  { name: "Cool FM Abuja 96.9", streamUrl: "https://coolfmabuja969-atunwadigital.streamguys1.com/coolfmabuja969", sourceAttribution: "atunwa" },
  { name: "Wazobia FM Abuja 99.5", streamUrl: "https://wazobiafmabuja995-atunwadigital.streamguys1.com/wazobiafmabuja995", sourceAttribution: "atunwa" },
  { name: "Nigeria Info Abuja 95.1", streamUrl: "https://nigeriainfoabuja951-atunwadigital.streamguys1.com/nigeriainfoabuja951", sourceAttribution: "atunwa" },
  { name: "Wazobia FM Port Harcourt 94.1", streamUrl: "https://wazobiafmph941-atunwadigital.streamguys1.com/wazobiafmph941", sourceAttribution: "atunwa" },
  { name: "Cool FM Port Harcourt 95.9", streamUrl: "https://coolfmph959-atunwadigital.streamguys1.com/coolfmph959", sourceAttribution: "atunwa" },
  { name: "Classic FM Port Harcourt", streamUrl: "https://classicfmph-atunwadigital.streamguys1.com/classicfmph", sourceAttribution: "atunwa" },
  { name: "Beat FM Port Harcourt", streamUrl: "https://beatfmph-atunwadigital.streamguys1.com/beatfmph", sourceAttribution: "atunwa" },
  { name: "Beat FM Ibadan", streamUrl: "https://beatfmibadan-atunwadigital.streamguys1.com/beatfmibadan", sourceAttribution: "atunwa" },
  { name: "Cool FM Kano", streamUrl: "https://coolfmkano-atunwadigital.streamguys1.com/coolfmkano", sourceAttribution: "atunwa" },
  { name: "Wazobia FM Kano", streamUrl: "https://wazobiafmkano-atunwadigital.streamguys1.com/wazobiafmkano", sourceAttribution: "atunwa" },
  { name: "Rhythm 93.7 Lagos", streamUrl: "https://rhythm937fmlagos-atunwadigital.streamguys1.com/rhythm937fmlagos", sourceAttribution: "atunwa" },
  { name: "Smooth 98.1 Lagos", streamUrl: "https://smooth981fmlagos-atunwadigital.streamguys1.com/smooth981fmlagos", sourceAttribution: "atunwa" },
  { name: "Inspiration 92.3 Lagos", streamUrl: "https://inspiration923fmlagos-atunwadigital.streamguys1.com/inspiration923fmlagos", sourceAttribution: "atunwa" },
  { name: "MAX 102.3 Lagos", streamUrl: "https://max1023fmlagos-atunwadigital.streamguys1.com/max1023fmlagos", sourceAttribution: "atunwa" },
  { name: "Splash FM Ibadan", streamUrl: "https://splashfmibadan-atunwadigital.streamguys1.com/splashfmibadan", sourceAttribution: "atunwa" },
  { name: "Fresh FM Ibadan", streamUrl: "https://freshfmibadan-atunwadigital.streamguys1.com/freshfmibadan", sourceAttribution: "atunwa" },
  { name: "Agidigbo 88.7 FM", streamUrl: "https://agidigbo887fm-atunwadigital.streamguys1.com/agidigbo887fm", sourceAttribution: "atunwa" },
  { name: "Raypower FM Abuja", streamUrl: "https://raypowerabuja-atunwadigital.streamguys1.com/raypowerabuja", sourceAttribution: "atunwa" },
  { name: "Human Rights Radio Brekete", streamUrl: "https://brekete-atunwadigital.streamguys1.com/brekete", sourceAttribution: "atunwa" },
  // Keep earlier working/guessed mounts below for second-pass retries
  { name: "Cool FM Abuja", streamUrl: "https://coolfmabuja-atunwadigital.streamguys1.com/coolfmabuja", sourceAttribution: "atunwa" },
  { name: "Wazobia FM Abuja", streamUrl: "https://wazobiafmabuja-atunwadigital.streamguys1.com/wazobiafmabuja", sourceAttribution: "atunwa" },
  { name: "Nigeria Info Abuja", streamUrl: "https://nigeriainfoabuja-atunwadigital.streamguys1.com/nigeriainfoabuja", sourceAttribution: "atunwa" },
  { name: "Classic FM Abuja", streamUrl: "https://classicfmabuja-atunwadigital.streamguys1.com/classicfmabuja", sourceAttribution: "atunwa" },
  { name: "Beat FM Abuja", streamUrl: "https://beatfmabuja-atunwadigital.streamguys1.com/beatfmabuja", sourceAttribution: "atunwa" },
  { name: "Wazobia FM Port Harcourt", streamUrl: "https://wazobiafmph-atunwadigital.streamguys1.com/wazobiafmph", sourceAttribution: "atunwa" },
  { name: "Cool FM Port Harcourt", streamUrl: "https://coolfmph-atunwadigital.streamguys1.com/coolfmph", sourceAttribution: "atunwa" },
  { name: "Naija FM Lagos", streamUrl: "https://naijafmlagos-atunwadigital.streamguys1.com/naijafmlagos", sourceAttribution: "atunwa" },
  { name: "Naija FM Port Harcourt", streamUrl: "https://naijafmph-atunwadigital.streamguys1.com/naijafmph", sourceAttribution: "atunwa" },
  { name: "Naija FM Ibadan", streamUrl: "https://naijafmibadan-atunwadigital.streamguys1.com/naijafmibadan", sourceAttribution: "atunwa" },
  { name: "Rhythm 93.7 Lagos", streamUrl: "https://rhythm937lagos-atunwadigital.streamguys1.com/rhythm937lagos", sourceAttribution: "atunwa" },
  { name: "Hot FM Lagos", streamUrl: "https://hotfmlagos-atunwadigital.streamguys1.com/hotfmlagos", sourceAttribution: "atunwa" },
  { name: "Hot FM Abuja", streamUrl: "https://hotfmabuja-atunwadigital.streamguys1.com/hotfmabuja", sourceAttribution: "atunwa" },
  { name: "Arewa Radio", streamUrl: "https://arewaradio-atunwadigital.streamguys1.com/arewaradio", sourceAttribution: "atunwa" },
  { name: "Liberty Radio Abuja", streamUrl: "https://libertyradioabuja-atunwadigital.streamguys1.com/libertyradioabuja", sourceAttribution: "atunwa" },
  { name: "Eagles FM 102.3 Abuja", streamUrl: "https://eagles1023fmabuja-atunwadigital.streamguys1.com/eagles1023fmabuja", sourceAttribution: "atunwa" },
  { name: "Inspiration 92.3 Lagos", streamUrl: "https://inspiration923lagos-atunwadigital.streamguys1.com/inspiration923lagos", sourceAttribution: "atunwa" },
  { name: "Smooth 98.1 Lagos", streamUrl: "https://smooth981lagos-atunwadigital.streamguys1.com/smooth981lagos", sourceAttribution: "atunwa" },
  { name: "WFM 91.7 Lagos", streamUrl: "https://wfm917lagos-atunwadigital.streamguys1.com/wfm917lagos", sourceAttribution: "atunwa" },
  { name: "Max 102.3 Lagos", streamUrl: "https://max1023lagos-atunwadigital.streamguys1.com/max1023lagos", sourceAttribution: "atunwa" },
  { name: "Bond FM Lagos", streamUrl: "https://bondfmlagos-atunwadigital.streamguys1.com/bondfmlagos", sourceAttribution: "atunwa" },
  { name: "Brila FM", streamUrl: "https://brilafm-atunwadigital.streamguys1.com/brilafm", sourceAttribution: "atunwa" },
  { name: "Hit FM Nigeria", streamUrl: "https://stream2.voltsradio.com/listen/hit_95.9fm/radio.mp3", sourceAttribution: "voltsradio" },
  { name: "KAM Radio", streamUrl: "https://listen.radioking.com/radio/587294/stream/647783", sourceAttribution: "radioking" },
  { name: "Preces Radio", streamUrl: "https://s4.radio.co/s522dfe16a/listen", sourceAttribution: "radio.co" },
  { name: "Karis Radio", streamUrl: "https://visual.shoutca.st/stream/karis/stream", sourceAttribution: "shoutca.st" },
  { name: "9ja French Radio", streamUrl: "https://listen.radioking.com/radio/639160/stream/702133", sourceAttribution: "radioking" },
  { name: "Kaakaki Radio", streamUrl: "https://stream.zeno.fm/wgv77p3h4p8uv", sourceAttribution: "zeno" },
  { name: "Nigerian Gospel Music Radio", streamUrl: "https://stream.zeno.fm/3fmqr74a7f8uv", sourceAttribution: "zeno" },
];

function hashId(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 32);
}

function isRejectedUrl(url: string) {
  // Short-lived signed openstream tokens.
  if (/[?&]k=\d{8,}/i.test(url) && /openstream\.co/i.test(url)) return "short_lived_signed_url";
  // Known non-GH rows that appeared in a Ghana playlist dump.
  if (/eagles1023fmabuja|lounge877fmlagos/i.test(url)) return "wrong_country_feed";
  return null;
}

function buildCandidate(
  entry: PlaylistEntry,
  countryCode: string,
  countryName: string
): NormalizedRadioStation | null {
  const reject = isRejectedUrl(entry.streamUrl);
  if (reject) return null;
  const sourceStreamUrl = normalizeRadioUrl(entry.streamUrl, { stream: true });
  const normalizedStreamUrl = normalizeRadioUrl(sourceStreamUrl, { stream: true }).toLowerCase();
  const cleanedName = cleanRadioText(entry.name, 300);
  const normalizedName = normalizeRadioName(cleanedName);
  if (!sourceStreamUrl || !normalizedStreamUrl || !cleanedName || !normalizedName) return null;

  const sourceStationId = `curated_${countryCode.toLowerCase()}_${hashId(normalizedStreamUrl)}`;
  const homepageUrl = null;
  const host = getHomepageHost(homepageUrl);

  const now = new Date().toISOString();
  return {
    name: cleanedName,
    normalized_name: normalizedName,
    station_fingerprint: buildRadioStationFingerprint({
      normalized_stream_url: normalizedStreamUrl,
      normalized_name: normalizedName,
      country_code: countryCode,
      normalized_homepage_host: host,
    }),
    fingerprint_version: 1,
    source_name: "radio_browser",
    source_type: "radio_browser",
    source_uuid: sourceStationId,
    source_station_id: sourceStationId,
    source_station_uuid: sourceStationId,
    source_server: `hidden_tunes_trusted_catalog:${entry.sourceAttribution}`,
    source_stream_url: sourceStreamUrl,
    stream_url: sourceStreamUrl,
    normalized_stream_url: normalizedStreamUrl,
    homepage_url: homepageUrl,
    normalized_homepage_host: host,
    favicon_url: null,
    country: countryName,
    country_code: countryCode,
    state: null,
    language: null,
    tags: [countryName.toLowerCase(), "curated"],
    category_slug: "global",
    categories: ["global"],
    bitrate: null,
    codec: null,
    votes: null,
    click_count: null,
    source_payload_hash: hashId(`${cleanedName}|${normalizedStreamUrl}`),
    source_last_seen_at: now,
    is_active: true,
    last_checked_at: now,
  };
}

function seedsFor(code: string) {
  if (code === "GH") return GHANA_SEED;
  if (code === "NG") return NIGERIA_SEED;
  return [] as PlaylistEntry[];
}

async function main() {
  loadAdminEnv(adminRoot);
  const args = new Set(process.argv.slice(2));
  const execute = args.has("--execute");
  const countryIndex = process.argv.indexOf("--country");
  const code = String(process.argv[countryIndex + 1] || "").toUpperCase();
  const meta = getAfricanCountry(code);
  if (!meta) throw new Error(`Unsupported country ${code}`);

  const seeds = seedsFor(code);
  if (!seeds.length) throw new Error(`No curated seed list for ${code}`);

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const report: Record<string, unknown> = {
    mode: execute ? "execute" : "dry-run",
    country: meta.name,
    code,
    started_at: new Date().toISOString(),
    results: [] as unknown[],
  };
  const stats = {
    candidates: seeds.length,
    rejected_url: 0,
    normalize_failed: 0,
    probe_failed: 0,
    duplicate: 0,
    imported: 0,
    verified_playable: 0,
    updated_existing: 0,
  };

  for (const seed of seeds) {
    const reject = isRejectedUrl(seed.streamUrl);
    if (reject) {
      stats.rejected_url += 1;
      (report.results as unknown[]).push({ name: seed.name, outcome: "rejected_url", reason: reject });
      continue;
    }
    const candidate = buildCandidate(seed, meta.code, meta.name);
    if (!candidate) {
      stats.normalize_failed += 1;
      (report.results as unknown[]).push({ name: seed.name, outcome: "normalize_failed" });
      continue;
    }

    const probe = await probeRadioStream(candidate.stream_url, {
      timeoutMs: 12_000,
      maxRedirects: 5,
      maxPlaylistBytes: 128 * 1024,
      maxReadBytes: 24 * 1024,
    });
    if (!probe.playable) {
      stats.probe_failed += 1;
      (report.results as unknown[]).push({
        name: seed.name,
        outcome: "probe_failed",
        reason: probe.reason,
        probe_outcome: probe.outcome,
        url: candidate.stream_url,
      });
      continue;
    }

    const existing = await findExistingRadioStationId(supabase, candidate);
    if (existing) {
      stats.duplicate += 1;
      if (execute) {
        const { data: row } = await supabase
          .from("radio_stations")
          .select(
            "id,name,stream_url,source_stream_url,playback_status,reliability_score,consecutive_failures,quarantined_at,disabled_at,is_verified"
          )
          .eq("id", existing.id)
          .maybeSingle();
        if (row) {
          const update = applyRadioVerificationProbe(row as never, probe);
          const payload: Record<string, unknown> = {
            ...update,
            delivery_mode: candidate.stream_url.startsWith("https://") ? "direct_https" : "backend_relay",
          };
          if (probe.finalUrl?.startsWith("https://")) payload.stream_url = probe.finalUrl;
          await supabase.from("radio_stations").update(payload).eq("id", existing.id);
          stats.updated_existing += 1;
          if (update.playback_status === "playable") stats.verified_playable += 1;
        }
      }
      (report.results as unknown[]).push({
        name: seed.name,
        outcome: "duplicate_existing",
        station_id: existing.id,
        reason: existing.reason,
        probe: probe.outcome,
      });
      continue;
    }

    if (!execute) {
      stats.imported += 1;
      stats.verified_playable += 1;
      (report.results as unknown[]).push({
        name: seed.name,
        outcome: "dry_run_would_insert",
        url: candidate.stream_url,
      });
      continue;
    }

    const inserted = await insertNewRadioStationOnly(supabase, candidate, { dryRun: false });
    if (inserted.outcome !== "inserted" || !inserted.stationId) {
      (report.results as unknown[]).push({
        name: seed.name,
        outcome: inserted.outcome,
        error: inserted.error,
      });
      continue;
    }

    const row = {
      id: inserted.stationId,
      reliability_score: 0,
      consecutive_failures: 0,
    };
    const update = applyRadioVerificationProbe(row as never, probe);
    const payload: Record<string, unknown> = {
      ...update,
      delivery_mode: candidate.stream_url.startsWith("https://") ? "direct_https" : "backend_relay",
      resolved_stream_url: probe.finalUrl || candidate.stream_url,
    };
    await supabase.from("radio_stations").update(payload).eq("id", inserted.stationId);
    stats.imported += 1;
    stats.verified_playable += 1;
    (report.results as unknown[]).push({
      name: seed.name,
      outcome: "imported_playable",
      station_id: inserted.stationId,
      url: candidate.stream_url,
      delivery: payload.delivery_mode,
    });
  }

  const { count: publicCount } = await supabase
    .from("radio_stations")
    .select("id", { count: "exact", head: true })
    .eq("country_code", code)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable")
    .eq("is_mature", false)
    .is("quarantined_at", null)
    .is("disabled_at", null)
    .gte("reliability_score", 60);

  report.stats = stats;
  report.public_playable_total = publicCount || 0;
  report.finished_at = new Date().toISOString();

  const queue = loadAfricaRadioQueue(adminRoot);
  const entry = getQueueEntry(queue, code);
  if (entry) {
    entry.imported += stats.imported;
    entry.duplicates += stats.duplicate;
    entry.rejected += stats.probe_failed + stats.rejected_url;
    entry.candidates_discovered += seeds.length;
    entry.candidates_tested += seeds.length;
    entry.public_playable_total = publicCount || entry.public_playable_total;
    entry.sources_searched = Array.from(
      new Set([...(entry.sources_searched || []), "curated_official_playlist_seeds", "atunwa_streamguys", "localstreamgh", "radio.co"])
    );
    entry.notes = [
      ...(entry.notes || []),
      `curated_playlist_import imported=${stats.imported} playable=${stats.verified_playable} duplicates=${stats.duplicate} failed=${stats.probe_failed}`,
    ];
    saveAfricaRadioQueue(adminRoot, queue);
  }

  const outPath = path.join(
    adminRoot,
    "data",
    "radio-africa-reports",
    `${code.toLowerCase()}-curated-import-report.json`
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, stats, public_playable_total: publicCount }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

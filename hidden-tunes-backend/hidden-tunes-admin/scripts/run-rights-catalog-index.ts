import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

import { DJCITY_UPLOADER_ID, MUSIC_CUTOFF } from "../lib/rights/cohorts";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";

const DEFAULT_LEDGER = resolve(process.cwd(), "..", "..", "..", "HIDDENTUNES-APPLE-5.2.3-RIGHTS-EVIDENCE", "HIDDENTUNES-BACKEND-RIGHTS-AUDIT.csv");
const inputArg = process.argv.find((value) => value.startsWith("--input="));
const inputPath = resolve(inputArg ? inputArg.slice("--input=".length) : DEFAULT_LEDGER);
const execute = process.argv.includes("--execute");
const writeEnabled = process.env.RIGHTS_INDEX_WRITE_ENABLED === "true";
const BATCH_SIZE = 1000;

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value); value = "";
    } else value += char;
  }
  values.push(value);
  return values;
}

function boolean(value: string) { return value.toLowerCase() === "true"; }
function contentType(value: string) {
  const map: Record<string, string> = {
    MUSIC_TRACK: "music", RADIO_STATION: "radio", TV_CHANNEL: "tv",
    PODCAST_SHOW: "podcast_show", PODCAST_EPISODE: "podcast_episode",
    AUDIOBOOK: "audiobook", LECTURE: "lecture", MOTIVATIONAL: "motivational",
    SPORTS_FIXTURE: "sports", SPORTS_BROADCAST: "sports",
  };
  return map[value] ?? null;
}

function streamType(row: Record<string, string>) {
  if (boolean(row.REHOSTED)) return "rehosted";
  if (boolean(row.PROXIED)) return "proxied";
  if (boolean(row.DIRECT_STREAM)) return "direct";
  return "unknown";
}

function ingestionTimestamp(row: Record<string, string>) {
  const match = row.TECHNICAL_PROVENANCE?.match(/(?:created_at|uploaded_at|imported_at|published_at)=([^;]+)/i);
  if (!match || Number.isNaN(Date.parse(match[1]))) return null;
  return new Date(match[1]).toISOString();
}

async function loadProviders() {
  if (!execute) return new Map<string, string>();
  const result = await getSupabaseAdmin().from("rights_providers").select("id,slug");
  if (result.error) throw result.error;
  return new Map((result.data ?? []).map((provider) => [provider.slug, provider.id]));
}

function providerSlug(raw: string) {
  const value = raw.toLowerCase();
  if (value.includes("mureka")) return "mureka";
  if (value.includes("djcity")) return "djcity";
  if (value.includes("librivox")) return "librivox";
  if (value.includes("internet archive")) return "internet-archive";
  if (value.includes("iptv")) return "iptv-org";
  if (value.includes("radio browser")) return "radio-browser";
  if (value.includes("podcast index")) return "podcast-index";
  return null;
}

async function main() {
  if (execute && !writeEnabled) throw new Error("--execute requires RIGHTS_INDEX_WRITE_ENABLED=true");
  const providers = await loadProviders();
  const lines = createInterface({ input: createReadStream(inputPath, { encoding: "utf8" }), crlfDelay: Infinity });
  let headers: string[] | null = null;
  let batch: Record<string, unknown>[] = [];
  let rows = 0;
  let skipped = 0;
  let murekaMusic = 0;
  let djcityMusic = 0;
  const keys = new Set<string>();

  async function flush() {
    if (!batch.length) return;
    if (execute) {
      const result = await getSupabaseAdmin().from("rights_catalog_items").upsert(batch, { onConflict: "content_type,content_id" });
      if (result.error) throw result.error;
    }
    batch = [];
  }

  for await (const line of lines) {
    if (!headers) { headers = parseCsvLine(line); continue; }
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const type = contentType(row.CONTENT_TYPE);
    if (!type || !row.INTERNAL_ID) { skipped++; continue; }
    const key = `${type}:${row.INTERNAL_ID}`;
    if (keys.has(key)) throw new Error(`duplicate_ledger_key:${key}`);
    keys.add(key);
    const ingestedAt = ingestionTimestamp(row);
    const ownerConfirmedMusicSlug = type === "music" && ingestedAt
      ? Date.parse(ingestedAt) <= Date.parse(MUSIC_CUTOFF) ? "mureka" : "djcity"
      : null;
    if (ownerConfirmedMusicSlug === "mureka") murekaMusic++;
    if (ownerConfirmedMusicSlug === "djcity") djcityMusic++;
    const slug = ownerConfirmedMusicSlug ?? providerSlug(row.PROVIDER || row.IMPORTER || "");
    const uploader = row.UPLOADER?.trim().toLowerCase();
    batch.push({
      content_type: type, content_id: row.INTERNAL_ID, title: row.TITLE || "Untitled",
      provider_id: slug ? providers.get(slug) ?? null : null,
      source_type: row.IMPORTER || null, source_id: row.SOURCE_ID || null,
      source_host: row.STREAM_HOST || null, uploader_id: uploader === "mygermanlevel@gmail.com" || uploader === DJCITY_UPLOADER_ID ? DJCITY_UPLOADER_ID : null,
      import_batch: row.IMPORT_BATCH && !row.IMPORT_BATCH.startsWith("NOT_RECORDED") ? row.IMPORT_BATCH : null,
      ingested_at: ingestedAt, stream_type: streamType(row), source_active: boolean(row.ACTIVE),
      base_rights_status: "unknown", evidence_status: "missing", ios_enabled: boolean(row.IOS_ACCESSIBLE),
      sort_at: ingestedAt ?? new Date(0).toISOString(), source_version: type === "music" ? "final-owner-music-provenance-2026-09-04" : "phase3-master-ledger",
    });
    rows++;
    if (batch.length >= BATCH_SIZE) { await flush(); if (rows % 100_000 === 0) console.log(`Indexed ${rows.toLocaleString()} rows...`); }
  }
  await flush();
  if (rows !== 1_065_943 || skipped !== 0) throw new Error(`ledger_reconciliation_failed:${rows}:${skipped}`);
  if (murekaMusic !== 1_245 || djcityMusic !== 3_498) throw new Error(`owner_music_reconciliation_failed:${murekaMusic}:${djcityMusic}`);
  console.log(JSON.stringify({ inputPath, mode: execute ? "EXECUTE" : "DRY_RUN", rows, uniqueKeys: keys.size, skipped, music: { mureka: murekaMusic, djcity: djcityMusic, unknown: 0, other: 0, total: murekaMusic + djcityMusic }, productionEligibilityChanged: false }));
}

void main();

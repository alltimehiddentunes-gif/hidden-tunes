import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadTvExpansion25kCheckpoint } from "../lib/tvExpansion25k/checkpoint";
import { TV_EXPANSION_CHECKPOINT_DIR } from "../lib/tvExpansion25k/constants";
import { getTvPlatformEligibleCount } from "../lib/tvExpansion25k/platformCount";
import { TV_EXPANSION_SOURCE_ADAPTERS } from "../lib/tvExpansion25k/sources/registry";
import { estimateIndependentSourceInventory } from "../lib/tvExpansion25k/sourceInventoryEstimate";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));

const SOURCE_AUDIT: Array<{
  id: string;
  classification:
    | "Independent upstream"
    | "Derived from iptv-org"
    | "Derived from another registered source"
    | "Fixed starter list"
    | "Curated seed list";
  upstream: string;
  endpoint: string;
  independent: boolean;
}> = [
  { id: "iptv-org", classification: "Independent upstream", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/streams.json", independent: true },
  { id: "free-tv-legal", classification: "Independent upstream", upstream: "Free-TV/IPTV", endpoint: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8", independent: true },
  { id: "official-broadcasters", classification: "Derived from iptv-org", upstream: "iptv-org channels.json category filter", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "public-broadcasters", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "government-tv", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "parliamentary-tv", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "regional-tv", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "community-tv", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "municipal-tv", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "education-tv", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "university-tv", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "official-fast-providers", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "news-broadcasters", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "sports-broadcasters", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "music-tv", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "cultural-broadcasters", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "religious-broadcasters", classification: "Derived from iptv-org", upstream: "iptv-org", endpoint: "https://iptv-org.github.io/api/channels.json", independent: false },
  { id: "official-youtube-live", classification: "Fixed starter list", upstream: "Hidden Tunes curated YouTube list", endpoint: "inline fixed list", independent: true },
  { id: "curated-seeds", classification: "Curated seed list", upstream: "Hidden Tunes curated HLS seeds", endpoint: "lib/tvCuratedSeedBridge", independent: true },
  { id: "youtube-starter", classification: "Fixed starter list", upstream: "Hidden Tunes starter SQL catalog", endpoint: "supabase/seeds/tv_starter_catalog.sql", independent: true },
  { id: "tdtchannels", classification: "Independent upstream", upstream: "LaQuay/TDTChannels", endpoint: "https://www.tdtchannels.com/lists/tv.json", independent: true },
  { id: "pluto-tv-fast", classification: "Independent upstream", upstream: "Pluto TV (Paramount)", endpoint: "https://api.pluto.tv/v2/channels", independent: true },
  { id: "official-global-hls", classification: "Independent upstream", upstream: "Official broadcaster CDNs", endpoint: "lib/tvExpansion25k/sources/data/officialGlobalHls.json", independent: true },
  { id: "youtube-official-global", classification: "Independent upstream", upstream: "YouTube official broadcaster channels", endpoint: "lib/tvExpansion25k/sources/data/youtubeOfficialGlobal.json", independent: true },
  { id: "government-parliament-hls", classification: "Independent upstream", upstream: "Government and parliamentary institutions", endpoint: "lib/tvExpansion25k/sources/data/governmentParliamentHls.json", independent: true },
  { id: "samsung-tv-plus-fast", classification: "Independent upstream", upstream: "Samsung TV Plus (Paramount FAST)", endpoint: "https://i.mjh.nz/SamsungTVPlus/.channels.json.gz", independent: true },
  { id: "roku-fast-channels", classification: "Independent upstream", upstream: "Roku Channel FAST", endpoint: "https://i.mjh.nz/Roku/.channels.json.gz", independent: true },
  { id: "pluto-tv-global-mjh", classification: "Derived from another registered source", upstream: "Pluto TV regional catalogs (same Pluto TV upstream as pluto-tv-fast)", endpoint: "https://i.mjh.nz/PlutoTV/.channels.json.gz", independent: false },
  { id: "official-global-hls-ext", classification: "Derived from another registered source", upstream: "Official broadcaster CDNs (extended pass over officialGlobalHls.json)", endpoint: "lib/tvExpansion25k/sources/data/officialGlobalHls.json", independent: false },
  { id: "government-parliament-hls-ext", classification: "Derived from another registered source", upstream: "Government/parliament inventory (extended pass)", endpoint: "lib/tvExpansion25k/sources/data/governmentParliamentHls.json", independent: false },
  { id: "youtube-official-global-ext", classification: "Derived from another registered source", upstream: "YouTube official broadcasters (extended pass)", endpoint: "lib/tvExpansion25k/sources/data/youtubeOfficialGlobal.json", independent: false },
  { id: "paratv-official", classification: "Independent upstream", upstream: "ParaTV (Paradise-91)", endpoint: "https://raw.githubusercontent.com/Paradise-91/ParaTV/main/playlists/paratv/main/paratv.m3u", independent: true },
  { id: "free-tv-world-countries", classification: "Derived from another registered source", upstream: "Free-TV/IPTV country markdown lists", endpoint: "https://github.com/Free-TV/IPTV/tree/master/lists", independent: false },
  { id: "official-org-manifests", classification: "Independent upstream", upstream: "Official broadcaster CDNs worldwide", endpoint: "lib/tvExpansion25k/sources/data/worldwave/officialOrgManifests.json", independent: true },
  { id: "parliament-worldwave", classification: "Independent upstream", upstream: "Government and parliamentary institutions worldwide", endpoint: "lib/tvExpansion25k/sources/data/worldwave/parliamentWorldwave.json", independent: true },
  { id: "public-europe-wave2", classification: "Derived from another registered source", upstream: "Worldwave regional split (Europe)", endpoint: "lib/tvExpansion25k/sources/data/worldwave/publicEuropeWave2.json", independent: false },
  { id: "public-americas-wave2", classification: "Derived from another registered source", upstream: "Worldwave regional split (Americas)", endpoint: "lib/tvExpansion25k/sources/data/worldwave/publicAmericasWave2.json", independent: false },
  { id: "public-asia-pacific-wave2", classification: "Derived from another registered source", upstream: "Worldwave regional split (Asia-Pacific)", endpoint: "lib/tvExpansion25k/sources/data/worldwave/publicAsiaPacificWave2.json", independent: false },
  { id: "public-africa-middle-east-wave2", classification: "Derived from another registered source", upstream: "Worldwave regional split (Africa/Middle East)", endpoint: "lib/tvExpansion25k/sources/data/worldwave/publicAfricaMiddleEastWave2.json", independent: false },
  { id: "bloomberg-official", classification: "Independent upstream", upstream: "Bloomberg", endpoint: "https://www.bloomberg.com/media-manifest/streams/", independent: true },
  { id: "france-medias-official", classification: "Independent upstream", upstream: "France Medias Monde", endpoint: "https://static.france24.com/live/", independent: true },
  { id: "cgtn-official", classification: "Independent upstream", upstream: "CGTN / China Media Group", endpoint: "https://news.cgtn.com/resource/live/", independent: true },
  { id: "redbull-official", classification: "Independent upstream", upstream: "Red Bull Media House", endpoint: "https://rbmn-live.akamaized.net/", independent: true },
  { id: "dw-official", classification: "Independent upstream", upstream: "Deutsche Welle", endpoint: "https://dwamdstream102.akamaized.net/", independent: true },
  { id: "iptv-org-unseen-worldwave", classification: "Derived from iptv-org", upstream: "iptv-org streams.json unseen HTTPS pass", endpoint: "https://iptv-org.github.io/api/streams.json", independent: false },
  { id: "paratv-stream-manifests", classification: "Independent upstream", upstream: "ParaTV official stream manifests", endpoint: "https://github.com/Paradise-91/ParaTV/tree/main/streams", independent: true },
  { id: "independent-m3u-worldwave", classification: "Independent upstream", upstream: "Regional free-TV playlist directories", endpoint: "various GitHub M3U playlists", independent: true },
  { id: "youtube-official-worldwave", classification: "Independent upstream", upstream: "YouTube official broadcaster channels (worldwave)", endpoint: "lib/tvExpansion25k/sources/data/worldwave/youtubeOfficialWorldwave.json", independent: true },
];

async function main() {
  const checkpoint = loadTvExpansion25kCheckpoint(adminRoot);
  const platformEligible = await getTvPlatformEligibleCount();
  const inventory = await estimateIndependentSourceInventory();

  const report = {
    at: new Date().toISOString(),
    platformEligible,
    checkpointBatch: checkpoint.batchNumber,
    registeredAdapters: TV_EXPANSION_SOURCE_ADAPTERS.length,
    sourceAudit: SOURCE_AUDIT,
    independentSources: SOURCE_AUDIT.filter((row) => row.independent),
    derivedFromIptvOrg: SOURCE_AUDIT.filter((row) => row.classification === "Derived from iptv-org"),
    newIndependentInventory: inventory,
    resumeReady:
      inventory.independentSourceCount >= 10 &&
      inventory.activeInventory >= 5000 &&
      inventory.newActiveSources.length >= 10,
  };

  const outPath = path.join(adminRoot, TV_EXPANSION_CHECKPOINT_DIR, "source-inventory-audit.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

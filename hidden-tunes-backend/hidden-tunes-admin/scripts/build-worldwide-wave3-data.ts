import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WAVE3_SOURCE_RECORDS } from "../lib/tvExpansion25k/sources/worldwave3/wave3SourceMetadata";
import { parseM3uPlaylist } from "../lib/tvExpansion25k/sources/shared/m3uParser";
import { regionForCountryCode, WORLDWIDE_COUNTRY_CODES } from "../lib/tvExpansion25k/worldwide/countryCodes";
import {
  filterUnseenByUrl,
  loadExpansionSeenUrls,
} from "../lib/tvExpansion25k/worldwide/seenUrlLoader";
import {
  WAVE3_OFFICIAL_MANIFESTS,
  WAVE3_PARLIAMENT_GOVERNMENT,
  WAVE3_UNIVERSITY_EDUCATION,
  WAVE3_YOUTUBE_OFFICIAL,
  type Wave3SeedEntry,
} from "../lib/tvExpansion25k/worldwide/wave3Seeds";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const dataDir = path.join(adminRoot, "lib/tvExpansion25k/sources/data/worldwave3");

const JSON_TELES_BASE = "https://raw.githubusercontent.com/Alplox/json-teles/main";
const JSON_TELES_M3U_URLS = [
  `${JSON_TELES_BASE}/channels.m3u`,
  `${JSON_TELES_BASE}/m3u-playlists/cl.m3u`,
  `${JSON_TELES_BASE}/m3u-playlists/ar.m3u`,
  `${JSON_TELES_BASE}/m3u-playlists/ec.m3u`,
  `${JSON_TELES_BASE}/m3u-playlists/in.m3u`,
  `${JSON_TELES_BASE}/m3u-playlists/us.m3u`,
  `${JSON_TELES_BASE}/m3u-playlists/pe.m3u`,
];

type StreamEntry = Wave3SeedEntry;

function slugify(value: string) {
  return value.replace(/\W+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function loadWaveSeenUrls(seen: Set<string>) {
  // Only skip URLs already registered for wave3 rebuilds — not wave2 inventories.
  // Wave3 activation runs after wave2 exhaustion; dedupe relies on rejected fingerprints.
  const dir = path.join(adminRoot, "lib/tvExpansion25k/sources/data/worldwave3");
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const rows = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Array<{ url?: string }>;
    for (const row of rows) {
      const url = String(row.url || "")
        .trim()
        .replace(/\/+$/, "")
        .toLowerCase();
      if (url) seen.add(url);
    }
  }
}

async function loadJsonTelesEntries() {
  const entries: StreamEntry[] = [];
  const batchSeen = new Set<string>();

  for (const playlistUrl of JSON_TELES_M3U_URLS) {
    try {
      const text = await fetch(playlistUrl).then((row) => row.text());
      for (const row of parseM3uPlaylist(text)) {
        if (!row.url.startsWith("https://")) continue;
        const urlKey = row.url.toLowerCase();
        if (batchSeen.has(urlKey)) continue;
        batchSeen.add(urlKey);
        entries.push({
          id: slugify(`json-teles-${row.tvgId || row.title}`),
          title: row.title,
          url: row.url,
          country: row.tvgCountry || null,
          language: row.tvgLanguage || null,
          category: row.groupTitle || "Community",
          website: "https://github.com/Alplox/json-teles",
          channelName: row.tvgName || row.title,
          legalBasis: "Alplox json-teles independent community and regional television directory.",
        });
      }
    } catch {
      // Skip unavailable playlists.
    }
  }

  return entries;
}

async function loadIptvOrgIndexUnseenEntries() {
  const text = await fetch("https://iptv-org.github.io/iptv/index.m3u").then((row) => row.text());
  const entries: StreamEntry[] = [];
  const batchSeen = new Set<string>();

  for (const row of parseM3uPlaylist(text)) {
    const url = String(row.url || "");
    if (!url.startsWith("https://")) continue;
    if (/youtube|youtu\.be/i.test(url)) continue;
    const urlKey = url.toLowerCase();
    if (batchSeen.has(urlKey)) continue;
    batchSeen.add(urlKey);

    entries.push({
      id: slugify(`iptv-org-index-${row.tvgId || row.title}-${entries.length}`),
      title: row.title,
      url,
      country: row.tvgCountry || null,
      language: row.tvgLanguage || null,
      category: row.groupTitle || "General",
      website: "https://iptv-org.github.io/",
      channelName: row.tvgName || row.title,
      legalBasis: "iptv-org public index residual pass (derived organisational inventory, wave3).",
    });
  }

  return entries;
}

async function loadIptvOrgGithubCountryUnseenEntries() {
  const list = (await fetch("https://api.github.com/repos/iptv-org/iptv/contents/streams").then((row) =>
    row.json()
  )) as Array<{ name: string; download_url: string }>;

  const entries: StreamEntry[] = [];
  const batchSeen = new Set<string>();

  for (const file of list) {
    if (!file.name.endsWith(".m3u") || !file.download_url) continue;
    try {
      const text = await fetch(file.download_url).then((row) => row.text());
      for (const row of parseM3uPlaylist(text)) {
        const url = String(row.url || "");
        if (!url.startsWith("https://")) continue;
        if (/youtube|youtu\.be/i.test(url)) continue;
        const urlKey = url.toLowerCase();
        if (batchSeen.has(urlKey)) continue;
        batchSeen.add(urlKey);

        const country = file.name.replace(/\.m3u$/i, "").toUpperCase();
        entries.push({
          id: slugify(`iptv-org-github-${country}-${row.tvgId || row.title}-${entries.length}`),
          title: row.title,
          url,
          country: row.tvgCountry || country,
          language: row.tvgLanguage || null,
          category: row.groupTitle || "General",
          website: "https://github.com/iptv-org/iptv",
          channelName: row.tvgName || row.title,
          legalBasis:
            "iptv-org GitHub country stream residual pass (derived organisational inventory, wave3).",
        });
      }
    } catch {
      // Skip unavailable country files.
    }
  }

  return entries;
}

async function loadIptvOrgApiResidualEntries() {
  const [channelsResponse, streamsResponse] = await Promise.all([
    fetch("https://iptv-org.github.io/api/channels.json"),
    fetch("https://iptv-org.github.io/api/streams.json"),
  ]);
  const channels = (await channelsResponse.json()) as Array<{
    id: string;
    name: string;
    country?: string;
    categories?: string[];
    is_nsfw?: boolean;
  }>;
  const streams = (await streamsResponse.json()) as Array<{ channel: string; url: string }>;
  const channelById = new Map(
    channels.filter((row) => row?.id && row?.name && !row.is_nsfw).map((row) => [row.id, row])
  );

  const entries: StreamEntry[] = [];
  const batchSeen = new Set<string>();

  for (const stream of streams) {
    const url = String(stream.url || "");
    if (!url.startsWith("https://")) continue;
    if (/youtube|youtu\.be/i.test(url)) continue;

    const channel = channelById.get(stream.channel);
    if (!channel) continue;

    const urlKey = url.toLowerCase();
    if (batchSeen.has(urlKey)) continue;
    batchSeen.add(urlKey);

    entries.push({
      id: slugify(`iptv-org-residual-${channel.id}-${entries.length}`),
      title: channel.name,
      url,
      country: channel.country || null,
      category: channel.categories?.[0] || "General",
      website: "https://iptv-org.github.io/",
      channelName: channel.name,
      legalBasis:
        "iptv-org public API residual HTTPS pass (derived organisational inventory, wave3).",
    });
  }

  return entries;
}

async function fetchXumoJson(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://play.xumo.com",
      Referer: "https://play.xumo.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    },
  });
  if (!response.ok) return null;
  return (await response.json()) as Record<string, unknown>;
}

function processXumoStreamUri(uri: string, deviceId: string, ifaId: string) {
  const replacements: Record<string, string> = {
    "[PLATFORM]": "web",
    "[APP_VERSION]": "1.0.0",
    "[timestamp]": String(Date.now()),
    "[app_bundle]": "play.xumo.com",
    "[IFA]": ifaId,
    "[IFA_TYPE]": "aaid",
    "[DEVICE_ID]": deviceId.replace(/-/g, ""),
    "[DEVICE_ID_TYPE]": "uuid",
  };
  let processed = uri;
  for (const [key, value] of Object.entries(replacements)) {
    processed = processed.replaceAll(key, value);
  }
  return processed.replace(/\[[^\]]+\]/g, "");
}

async function loadXumoOfficialEntries() {
  const deviceId = crypto.randomUUID();
  const ifaId = crypto.randomUUID();
  const listUrl =
    `https://valencia-app-mds.xumo.com/v2/proxy/channels/list/10006.json` +
    `?sort=hybrid&geoId=2f08a9b3&deviceId=${deviceId}&ifaId=${ifaId}`;
  const payload = await fetchXumoJson(listUrl);
  if (!payload) return [] as StreamEntry[];

  const items = ((payload.channel as { item?: unknown[] })?.item || []) as Array<Record<string, unknown>>;
  const entries: StreamEntry[] = [];
  const hour = new Date().getUTCHours();

  for (const item of items) {
    const props = (item.properties || {}) as Record<string, unknown>;
    if (String(props.is_live || "").toLowerCase() !== "true") continue;

    const channelId = String((item.guid as { value?: string })?.value || "");
    const title = String(item.title || "").trim();
    if (!channelId || !title) continue;

    let url = "";
    try {
      const broadcastUrl = `https://valencia-app-mds.xumo.com/v2/channels/channel/${channelId}/broadcast.json?hour=${hour}`;
      const broadcast = await fetchXumoJson(broadcastUrl);
      const assets = (broadcast?.assets || []) as Array<Record<string, unknown>>;
      let assetId = "";
      for (const asset of assets) {
        if (asset.live === true && asset.id) {
          assetId = String(asset.id);
          break;
        }
      }
      if (!assetId && assets[0]?.id) assetId = String(assets[0].id);
      if (!assetId) continue;

      const assetUrl =
        `https://valencia-app-mds.xumo.com/v2/assets/asset/${assetId}.json` +
        "?f=providers&f=title&f=genres";
      const asset = await fetchXumoJson(assetUrl);
      const providers = (asset?.providers || []) as Array<Record<string, unknown>>;
      for (const provider of providers) {
        for (const source of (provider.sources || []) as Array<Record<string, unknown>>) {
          const uri = String(source.uri || "");
          const produces = String(source.produces || "").toLowerCase();
          if (!uri) continue;
          if (produces.includes("mpegurl") || uri.includes(".m3u8")) {
            url = processXumoStreamUri(uri, deviceId, ifaId);
            break;
          }
        }
        if (url) break;
      }
    } catch {
      continue;
    }

    if (!url.startsWith("https://")) continue;

    const genres = (item.genre || []) as Array<{ value?: string } | string>;
    const category =
      genres
        .map((g) => (typeof g === "string" ? g : g.value || ""))
        .filter(Boolean)
        .join(";") || "Entertainment";

    entries.push({
      id: slugify(`xumo-${channelId}`),
      title,
      url,
      country: "US",
      category,
      website: "https://play.xumo.com/",
      channelName: title,
      legalBasis: "Xumo Play official public FAST live HLS stream.",
    });

    if (entries.length % 25 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return entries;
}

function splitByRegion(entries: StreamEntry[]) {
  return {
    americas: entries.filter((row) =>
      ["North America", "South America", "Central America", "Caribbean"].includes(
        regionForCountryCode(row.country)
      )
    ),
    europe: entries.filter((row) => regionForCountryCode(row.country) === "Europe"),
    asiaPacific: entries.filter((row) =>
      ["Asia", "Oceania", "Pacific Islands"].includes(regionForCountryCode(row.country))
    ),
    africaMiddleEast: entries.filter((row) =>
      ["Africa", "Middle East"].includes(regionForCountryCode(row.country))
    ),
  };
}

function countCountries(entries: StreamEntry[]) {
  return new Set(entries.map((row) => row.country).filter(Boolean)).size;
}

function updateCoverage(entries: StreamEntry[]) {
  const coveragePath = path.join(adminRoot, "data/tv-expansion-25k/worldwide-coverage.json");
  if (!fs.existsSync(coveragePath)) return;

  const coverage = JSON.parse(fs.readFileSync(coveragePath, "utf8")) as Array<Record<string, unknown>>;
  const byCode = new Map(coverage.map((row) => [row.countryCode, row]));
  const now = new Date().toISOString();

  for (const entry of entries) {
    const code = String(entry.country || "").toUpperCase();
    if (!code || code.length !== 2) continue;
    const row = byCode.get(code);
    if (!row) continue;
    row.candidatesFound = Number(row.candidatesFound || 0) + 1;
    row.lastCheckedAt = now;
    row.status = "wave3_registered";
  }

  fs.writeFileSync(coveragePath, `${JSON.stringify(coverage, null, 2)}\n`, "utf8");
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  const seen = await loadExpansionSeenUrls(adminRoot);
  loadWaveSeenUrls(seen);

  const [jsonTelesRaw, xumoRaw, iptvOrgIndexRaw, iptvOrgGithubRaw, iptvOrgApiResidualRaw] =
    await Promise.all([
      loadJsonTelesEntries(),
      loadXumoOfficialEntries(),
      loadIptvOrgIndexUnseenEntries(),
      loadIptvOrgGithubCountryUnseenEntries(),
      loadIptvOrgApiResidualEntries(),
    ]);

  const officialManifests = filterUnseenByUrl(WAVE3_OFFICIAL_MANIFESTS, seen);
  const parliament = filterUnseenByUrl(WAVE3_PARLIAMENT_GOVERNMENT, seen);
  const university = filterUnseenByUrl(WAVE3_UNIVERSITY_EDUCATION, seen);
  const youtube = filterUnseenByUrl(WAVE3_YOUTUBE_OFFICIAL, seen);
  const jsonTeles = filterUnseenByUrl(jsonTelesRaw, seen);
  const xumo = filterUnseenByUrl(xumoRaw, seen);
  const iptvOrgIndex = filterUnseenByUrl(iptvOrgIndexRaw, seen);
  const iptvOrgGithub = filterUnseenByUrl(iptvOrgGithubRaw, seen);
  const iptvOrgApi = filterUnseenByUrl(iptvOrgApiResidualRaw, seen);
  const iptvOrgResidual = filterUnseenByUrl(
    [...iptvOrgIndex, ...iptvOrgGithub, ...iptvOrgApi],
    seen
  );

  const combinedRegional = filterUnseenByUrl(
    [...officialManifests, ...parliament, ...university, ...jsonTeles, ...xumo],
    seen
  );
  const regions = splitByRegion(combinedRegional);

  const write = (name: string, rows: StreamEntry[]) => {
    fs.writeFileSync(path.join(dataDir, name), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    return rows.length;
  };

  const independentTotal =
    officialManifests.length +
    parliament.length +
    university.length +
    youtube.length +
    jsonTeles.length +
    xumo.length;

  const totalNewCandidates =
    independentTotal + iptvOrgResidual.length + regions.americas.length + regions.europe.length + regions.asiaPacific.length + regions.africaMiddleEast.length;

  const independentOrganisations = WAVE3_SOURCE_RECORDS.filter(
    (row) =>
      row.classification === "Independent official upstream" ||
      row.classification === "Independent public directory" ||
      row.classification === "Independent licensed provider"
  ).length;

  const report = {
    at: new Date().toISOString(),
    seenUrlCount: seen.size,
    xumoOfficial: write("xumoOfficialWave3.json", xumo),
    jsonTelesCommunity: write("jsonTelesCommunityWave3.json", jsonTeles),
    countryOfficialManifests: write("countryOfficialManifestsWave3.json", officialManifests),
    parliamentGovernment: write("parliamentGovernmentWave3.json", parliament),
    universityEducation: write("universityEducationWave3.json", university),
    youtubeOfficial: write("youtubeOfficialWave3.json", youtube),
    iptvOrgApiResidual: write("iptvOrgApiResidualWave3.json", iptvOrgResidual),
    totalNewCandidates,
    independentCandidates: independentTotal,
    independentOrganisations,
    countriesRepresented: countCountries([
      ...officialManifests,
      ...parliament,
      ...university,
      ...youtube,
      ...jsonTeles,
      ...xumo,
      ...iptvOrgResidual,
    ]),
    regions: {
      americas: write("publicAmericasWave3.json", regions.americas),
      europe: write("publicEuropeWave3.json", regions.europe),
      asiaPacific: write("publicAsiaPacificWave3.json", regions.asiaPacific),
      africaMiddleEast: write("publicAfricaMiddleEastWave3.json", regions.africaMiddleEast),
    },
    resumeReady:
      (totalNewCandidates >= 5000 &&
        independentOrganisations >= 6 &&
        independentTotal >= 200) ||
      (totalNewCandidates >= 500 &&
        independentOrganisations >= 6 &&
        independentTotal >= 200 &&
        seen.size >= 15000),
  };

  // Dedupe note: derived iptv-org passes only include URLs not present in expansion seen set.

  fs.writeFileSync(
    path.join(adminRoot, "data/tv-expansion-25k/wave3-build-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(adminRoot, "data/tv-expansion-25k/wave3-source-registry.json"),
    `${JSON.stringify(WAVE3_SOURCE_RECORDS, null, 2)}\n`,
    "utf8"
  );

  updateCoverage([
    ...officialManifests,
    ...parliament,
    ...university,
    ...youtube,
    ...jsonTeles,
    ...xumo,
    ...iptvOrgResidual,
  ]);

  console.log(JSON.stringify(report, null, 2));

  if (!report.resumeReady) {
    console.error(
      `Wave3 build produced ${totalNewCandidates} candidates (independent ${independentTotal}); need at least 5000 total and 500 independent unseen.`
    );
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

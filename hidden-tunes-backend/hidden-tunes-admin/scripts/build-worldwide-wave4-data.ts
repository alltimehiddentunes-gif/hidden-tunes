import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WAVE4_SOURCE_RECORDS } from "../lib/tvExpansion25k/sources/worldwave4/wave4SourceMetadata";
import { parseM3uPlaylist } from "../lib/tvExpansion25k/sources/shared/m3uParser";
import { regionForCountryCode, WORLDWIDE_COUNTRY_CODES } from "../lib/tvExpansion25k/worldwide/countryCodes";
import {
  filterUnseenWave4Entries,
  loadWave4SeenUrls,
} from "../lib/tvExpansion25k/worldwide/wave4SeenUrlLoader";
import {
  WAVE4_COUNTRY_OFFICIAL_MANIFESTS,
  WAVE4_EDUCATION_CULTURE,
  WAVE4_INTERNATIONAL_NEWS,
  WAVE4_PARLIAMENT_GOVERNMENT,
  WAVE4_RELIGIOUS_EDUCATION,
  type Wave4SeedEntry,
} from "../lib/tvExpansion25k/worldwide/wave4Seeds";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const dataDir = path.join(adminRoot, "lib/tvExpansion25k/sources/data/worldwave4");

const IPTV_ORG_STREAMS_BASE =
  "https://raw.githubusercontent.com/iptv-org/iptv/master/streams";

const FREE_TV_ALT_BRANCHES = [
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8",
];

const COMMUNITY_PLAYLIST_URLS = [
  "https://raw.githubusercontent.com/FreeViewPlus/Australia-Free-TV/master/playlist.m3u8",
  "https://raw.githubusercontent.com/FreeViewPlus/UK-Channels/master/playlist.m3u8",
];

function slugify(value: string) {
  return value.replace(/\W+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function seedToEntry(seed: Wave4SeedEntry) {
  return {
    id: seed.id,
    title: seed.title,
    url: seed.url,
    country: seed.country || null,
    language: seed.language || null,
    category: seed.category || null,
    website: seed.website || null,
    channelName: seed.channelName || seed.title,
    legalBasis: seed.legalBasis || null,
  };
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.apple.mpegurl,text/plain,*/*" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

async function loadIptvOrgCountryStreams(seen: Set<string>) {
  const entries: ReturnType<typeof seedToEntry>[] = [];
  const batchSeen = new Set<string>();

  for (const countryCode of WORLDWIDE_COUNTRY_CODES) {
    const m3uUrl = `${IPTV_ORG_STREAMS_BASE}/${countryCode}.m3u`;
    try {
      const text = await fetchText(m3uUrl);
      for (const row of parseM3uPlaylist(text)) {
        if (!row.url.startsWith("https://")) continue;
        const urlKey = row.url.toLowerCase();
        if (seen.has(urlKey) || batchSeen.has(urlKey)) continue;
        batchSeen.add(urlKey);
        entries.push({
          id: slugify(`iptv-org-${countryCode}-${row.tvgId || row.title}`),
          title: row.title,
          url: row.url,
          country: typeof row.tvgCountry === "string" ? row.tvgCountry : countryCode,
          language: row.tvgLanguage || null,
          category: row.groupTitle || "General",
          website: "https://github.com/iptv-org/iptv",
          channelName: row.tvgName || row.title,
          legalBasis: "iptv-org public GitHub country stream directory (wave4 residual).",
        });
      }
    } catch {
      // Country M3U may not exist — skip.
    }
  }

  return entries;
}

async function loadCommunityPlaylists(seen: Set<string>) {
  const entries: ReturnType<typeof seedToEntry>[] = [];
  const batchSeen = new Set<string>();

  for (const playlistUrl of [...FREE_TV_ALT_BRANCHES, ...COMMUNITY_PLAYLIST_URLS]) {
    try {
      const text = await fetchText(playlistUrl);
      for (const row of parseM3uPlaylist(text)) {
        if (!row.url.startsWith("https://")) continue;
        const urlKey = row.url.toLowerCase();
        if (seen.has(urlKey) || batchSeen.has(urlKey)) continue;
        batchSeen.add(urlKey);
        entries.push({
          id: slugify(`community-${row.tvgId || row.title}`),
          title: row.title,
          url: row.url,
          country: row.tvgCountry || null,
          language: row.tvgLanguage || null,
          category: row.groupTitle || "Community",
          website: playlistUrl,
          channelName: row.tvgName || row.title,
          legalBasis: "Public community free-TV playlist directory.",
        });
      }
    } catch {
      // Offline build continues with seeds only.
    }
  }

  return entries;
}

function partitionRegional(entries: ReturnType<typeof seedToEntry>[]) {
  const regional: ReturnType<typeof seedToEntry>[] = [];
  for (const entry of entries) {
    const region = regionForCountryCode(entry.country || "");
    if (region === "unknown") continue;
    regional.push(entry);
  }
  return regional;
}

function writeJson(name: string, rows: unknown[]) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, `${name}.json`), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  return rows.length;
}

async function main() {
  const seen = loadWave4SeenUrls(adminRoot);

  const officialManifests = filterUnseenWave4Entries(
    WAVE4_COUNTRY_OFFICIAL_MANIFESTS.map(seedToEntry),
    seen
  );
  const parliament = filterUnseenWave4Entries(
    WAVE4_PARLIAMENT_GOVERNMENT.map(seedToEntry),
    seen
  );
  const internationalNews = filterUnseenWave4Entries(
    WAVE4_INTERNATIONAL_NEWS.map(seedToEntry),
    seen
  );
  const religiousEducation = filterUnseenWave4Entries(
    WAVE4_RELIGIOUS_EDUCATION.map(seedToEntry),
    seen
  );
  const educationCulture = filterUnseenWave4Entries(
    WAVE4_EDUCATION_CULTURE.map(seedToEntry),
    seen
  );

  const iptvOrgCountries = filterUnseenWave4Entries(await loadIptvOrgCountryStreams(seen), seen);
  const communityPlaylists = filterUnseenWave4Entries(await loadCommunityPlaylists(seen), seen);
  const regionalCommunity = partitionRegional([...communityPlaylists, ...iptvOrgCountries.slice(0, 2000)]);

  const counts = {
    iptvOrgGithubCountriesWave4: writeJson("iptvOrgGithubCountriesWave4", iptvOrgCountries),
    countryOfficialManifestsWave4: writeJson("countryOfficialManifestsWave4", officialManifests),
    parliamentGovernmentWave4: writeJson("parliamentGovernmentWave4", parliament),
    internationalNewsWave4: writeJson("internationalNewsWave4", internationalNews),
    religiousEducationWave4: writeJson("religiousEducationWave4", religiousEducation),
    educationCultureWave4: writeJson("educationCultureWave4", educationCulture),
    freeCommunityPlaylistsWave4: writeJson("freeCommunityPlaylistsWave4", communityPlaylists),
    regionalCommunityWave4: writeJson("regionalCommunityWave4", regionalCommunity),
  };

  const totalNewCandidates = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const independentCandidates =
    counts.countryOfficialManifestsWave4 +
    counts.parliamentGovernmentWave4 +
    counts.internationalNewsWave4 +
    counts.religiousEducationWave4 +
    counts.educationCultureWave4;

  const report = {
    at: new Date().toISOString(),
    seenUrlCount: seen.size,
    totalNewCandidates,
    independentCandidates,
    resumeReady: totalNewCandidates >= 500 && independentCandidates >= 50,
    perSource: counts,
    sourceRecords: WAVE4_SOURCE_RECORDS,
  };

  const reportPath = path.join(adminRoot, "data/tv-expansion-wave4/wave4-build-report.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  fs.writeFileSync(
    path.join(adminRoot, "data/tv-expansion-wave4/wave4-source-registry.json"),
    `${JSON.stringify(WAVE4_SOURCE_RECORDS, null, 2)}\n`,
    "utf8"
  );

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

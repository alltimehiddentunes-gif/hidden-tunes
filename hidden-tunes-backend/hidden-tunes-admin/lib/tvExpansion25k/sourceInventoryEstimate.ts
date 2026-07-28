import fs from "node:fs";
import path from "node:path";

import officialGlobalHlsData from "@/lib/tvExpansion25k/sources/data/officialGlobalHls.json";
import governmentParliamentHlsData from "@/lib/tvExpansion25k/sources/data/governmentParliamentHls.json";
import youtubeOfficialGlobalData from "@/lib/tvExpansion25k/sources/data/youtubeOfficialGlobal.json";
import bloombergOfficialData from "@/lib/tvExpansion25k/sources/data/worldwave/bloombergOfficial.json";
import cgtnOfficialData from "@/lib/tvExpansion25k/sources/data/worldwave/cgtnOfficial.json";
import dwOfficialData from "@/lib/tvExpansion25k/sources/data/worldwave/dwOfficial.json";
import franceMediasOfficialData from "@/lib/tvExpansion25k/sources/data/worldwave/franceMediasOfficial.json";
import freeTvWorldCountriesData from "@/lib/tvExpansion25k/sources/data/worldwave/freeTvWorldCountries.json";
import officialOrgManifestsData from "@/lib/tvExpansion25k/sources/data/worldwave/officialOrgManifests.json";
import paraTvOfficialData from "@/lib/tvExpansion25k/sources/data/worldwave/paraTvOfficial.json";
import paraTvStreamManifestsData from "@/lib/tvExpansion25k/sources/data/worldwave/paraTvStreamManifests.json";
import iptvOrgUnseenWorldwaveData from "@/lib/tvExpansion25k/sources/data/worldwave/iptvOrgUnseenWorldwave.json";
import independentM3uWorldwaveData from "@/lib/tvExpansion25k/sources/data/worldwave/independentM3uWorldwave.json";
import parliamentWorldwaveData from "@/lib/tvExpansion25k/sources/data/worldwave/parliamentWorldwave.json";
import publicAfricaMiddleEastWave2Data from "@/lib/tvExpansion25k/sources/data/worldwave/publicAfricaMiddleEastWave2.json";
import publicAmericasWave2Data from "@/lib/tvExpansion25k/sources/data/worldwave/publicAmericasWave2.json";
import publicAsiaPacificWave2Data from "@/lib/tvExpansion25k/sources/data/worldwave/publicAsiaPacificWave2.json";
import publicEuropeWave2Data from "@/lib/tvExpansion25k/sources/data/worldwave/publicEuropeWave2.json";
import redbullOfficialData from "@/lib/tvExpansion25k/sources/data/worldwave/redbullOfficial.json";
import youtubeOfficialWorldwaveData from "@/lib/tvExpansion25k/sources/data/worldwave/youtubeOfficialWorldwave.json";
import { loadWithCache } from "@/lib/tvExpansion25k/sources/shared/paginatedCache";
import { fetchGzJson } from "@/lib/tvExpansion25k/sources/shared/gzJsonFetch";
import { parseM3uPlaylist } from "@/lib/tvExpansion25k/sources/shared/m3uParser";
import { retryFetchJson, retryFetchText } from "@/lib/tvExpansion25k/sources/shared/retryFetch";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";
import {
  TV_EXPANSION_ACTIVE_SOURCE_IDS,
  TV_EXPANSION_WAVE2_INDEPENDENT_SOURCE_IDS,
} from "@/lib/tvExpansion25k/sources/registry";

type MjhCatalog = {
  slug?: string;
  regions?: Record<string, { channels?: Record<string, { license_url?: string }> }>;
  channels?: Record<string, unknown>;
};

async function estimateMjhCatalog(url: string, skipLicensed = false) {
  const catalog = await fetchGzJson<MjhCatalog>(url);
  let count = 0;
  if (catalog.regions) {
    for (const region of Object.values(catalog.regions)) {
      for (const channel of Object.values(region.channels || {})) {
        if (skipLicensed && channel.license_url) continue;
        count += 1;
      }
    }
  } else {
    count = Object.keys(catalog.channels || {}).length;
  }
  return count;
}

async function estimateTdtChannels() {
  const [catalog, m3uText] = await Promise.all([
    retryFetchJson<{ countries?: Array<{ ambits?: Array<{ channels?: Array<{ options?: Array<{ format?: string; url?: string }> }> }> }> }>(
      "https://www.tdtchannels.com/lists/tv.json"
    ),
    retryFetchText("https://www.tdtchannels.com/lists/tv.m3u8"),
  ]);

  const seen = new Set<string>();
  for (const country of catalog.countries || []) {
    for (const ambit of country.ambits || []) {
      for (const channel of ambit.channels || []) {
        const m3u8 = (channel.options || []).find((option) => option.format === "m3u8" && option.url);
        if (!m3u8?.url) continue;
        const urlCheck = validatePublicTvUrl(m3u8.url);
        if (!urlCheck.ok) continue;
        seen.add(urlCheck.url.toLowerCase());
      }
    }
  }

  for (const row of parseM3uPlaylist(m3uText)) {
    const urlCheck = validatePublicTvUrl(row.url);
    if (!urlCheck.ok) continue;
    seen.add(urlCheck.url.toLowerCase());
  }

  return seen.size;
}

async function estimatePlutoApi() {
  const channels = await retryFetchJson<Array<{ stitched?: { urls?: Array<{ type?: string; url?: string }> } }>>(
    "https://api.pluto.tv/v2/channels"
  );
  return channels.filter((channel) =>
    channel.stitched?.urls?.some((row) => row.type === "hls" && row.url && validatePublicTvUrl(row.url).ok)
  ).length;
}

export async function estimateIndependentSourceInventory() {
  const tdt = await loadWithCache("estimate-tdt", estimateTdtChannels, 5 * 60_000).catch(() => 0);
  const plutoApi = await loadWithCache("estimate-pluto", estimatePlutoApi, 5 * 60_000).catch(() => 0);
  const samsung = await loadWithCache(
    "estimate-samsung",
    () => estimateMjhCatalog("https://i.mjh.nz/SamsungTVPlus/.channels.json.gz", true),
    5 * 60_000
  ).catch(() => 0);
  const roku = await loadWithCache(
    "estimate-roku",
    () => estimateMjhCatalog("https://i.mjh.nz/Roku/.channels.json.gz"),
    5 * 60_000
  ).catch(() => 0);
  const plutoMjh = await loadWithCache(
    "estimate-pluto-mjh",
    () => estimateMjhCatalog("https://i.mjh.nz/PlutoTV/.channels.json.gz"),
    5 * 60_000
  ).catch(() => 0);

  const perSource = {
    tdtchannels: tdt,
    "pluto-tv-fast": plutoApi,
    "official-global-hls": officialGlobalHlsData.length,
    "youtube-official-global": youtubeOfficialGlobalData.length,
    "government-parliament-hls": governmentParliamentHlsData.length,
    "samsung-tv-plus-fast": samsung,
    "roku-fast-channels": roku,
    "pluto-tv-global-mjh": plutoMjh,
    "official-global-hls-ext": officialGlobalHlsData.length,
    "government-parliament-hls-ext": governmentParliamentHlsData.length,
    "youtube-official-global-ext": youtubeOfficialGlobalData.length,
    "paratv-official": paraTvOfficialData.length,
    "paratv-stream-manifests": paraTvStreamManifestsData.length,
    "iptv-org-unseen-worldwave": iptvOrgUnseenWorldwaveData.length,
    "independent-m3u-worldwave": independentM3uWorldwaveData.length,
    "free-tv-world-countries": freeTvWorldCountriesData.length,
    "official-org-manifests": officialOrgManifestsData.length,
    "parliament-worldwave": parliamentWorldwaveData.length,
    "public-europe-wave2": publicEuropeWave2Data.length,
    "public-americas-wave2": publicAmericasWave2Data.length,
    "public-asia-pacific-wave2": publicAsiaPacificWave2Data.length,
    "public-africa-middle-east-wave2": publicAfricaMiddleEastWave2Data.length,
    "bloomberg-official": bloombergOfficialData.length,
    "france-medias-official": franceMediasOfficialData.length,
    "cgtn-official": cgtnOfficialData.length,
    "redbull-official": redbullOfficialData.length,
    "dw-official": dwOfficialData.length,
    "youtube-official-worldwave": youtubeOfficialWorldwaveData.length,
  };

  const activeInventory = TV_EXPANSION_ACTIVE_SOURCE_IDS.reduce(
    (sum, id) => sum + (perSource[id as keyof typeof perSource] || 0),
    0
  );

  const independentActiveCount = TV_EXPANSION_WAVE2_INDEPENDENT_SOURCE_IDS.filter(
    (id) => (perSource[id as keyof typeof perSource] || 0) > 0
  ).length;

  return {
    independentSourceCount: independentActiveCount,
    totalCandidateEstimate: activeInventory,
    perSource,
    newActiveSources: TV_EXPANSION_ACTIVE_SOURCE_IDS.filter(
      (id) => (perSource[id as keyof typeof perSource] || 0) > 0
    ),
    activeInventory,
    independentActiveSources: [...TV_EXPANSION_WAVE2_INDEPENDENT_SOURCE_IDS],
  };
}

import bloombergOfficialData from "@/lib/tvExpansion25k/sources/data/worldwave/bloombergOfficial.json";
import cgtnOfficialData from "@/lib/tvExpansion25k/sources/data/worldwave/cgtnOfficial.json";
import dwOfficialData from "@/lib/tvExpansion25k/sources/data/worldwave/dwOfficial.json";
import franceMediasOfficialData from "@/lib/tvExpansion25k/sources/data/worldwave/franceMediasOfficial.json";
import freeTvWorldCountriesData from "@/lib/tvExpansion25k/sources/data/worldwave/freeTvWorldCountries.json";
import iptvOrgUnseenWorldwaveData from "@/lib/tvExpansion25k/sources/data/worldwave/iptvOrgUnseenWorldwave.json";
import independentM3uWorldwaveData from "@/lib/tvExpansion25k/sources/data/worldwave/independentM3uWorldwave.json";
import officialOrgManifestsData from "@/lib/tvExpansion25k/sources/data/worldwave/officialOrgManifests.json";
import paraTvOfficialData from "@/lib/tvExpansion25k/sources/data/worldwave/paraTvOfficial.json";
import paraTvStreamManifestsData from "@/lib/tvExpansion25k/sources/data/worldwave/paraTvStreamManifests.json";
import parliamentWorldwaveData from "@/lib/tvExpansion25k/sources/data/worldwave/parliamentWorldwave.json";
import publicAfricaMiddleEastWave2Data from "@/lib/tvExpansion25k/sources/data/worldwave/publicAfricaMiddleEastWave2.json";
import publicAmericasWave2Data from "@/lib/tvExpansion25k/sources/data/worldwave/publicAmericasWave2.json";
import publicAsiaPacificWave2Data from "@/lib/tvExpansion25k/sources/data/worldwave/publicAsiaPacificWave2.json";
import publicEuropeWave2Data from "@/lib/tvExpansion25k/sources/data/worldwave/publicEuropeWave2.json";
import redbullOfficialData from "@/lib/tvExpansion25k/sources/data/worldwave/redbullOfficial.json";
import youtubeOfficialWorldwaveData from "@/lib/tvExpansion25k/sources/data/worldwave/youtubeOfficialWorldwave.json";
import { createWorldwaveJsonAdapter } from "@/lib/tvExpansion25k/sources/shared/createWorldwaveJsonAdapter";
import type { FixedStreamEntry } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";

function asEntries(rows: FixedStreamEntry[]) {
  return rows;
}

export const bloombergOfficialAdapter = createWorldwaveJsonAdapter({
  id: "bloomberg-official",
  label: "Bloomberg official media-manifest",
  legalBasis: "Bloomberg public media-manifest live HLS endpoints.",
  entries: asEntries(bloombergOfficialData as FixedStreamEntry[]),
});

export const franceMediasOfficialAdapter = createWorldwaveJsonAdapter({
  id: "france-medias-official",
  label: "France Medias Monde official HLS",
  legalBasis: "France Medias Monde official France 24 public live HLS manifests.",
  entries: asEntries(franceMediasOfficialData as FixedStreamEntry[]),
});

export const cgtnOfficialAdapter = createWorldwaveJsonAdapter({
  id: "cgtn-official",
  label: "CGTN official live HLS",
  legalBasis: "CGTN official public live HLS resource endpoints.",
  entries: asEntries(cgtnOfficialData as FixedStreamEntry[]),
});

export const redbullOfficialAdapter = createWorldwaveJsonAdapter({
  id: "redbull-official",
  label: "Red Bull TV official HLS",
  legalBasis: "Red Bull Media House official public live stream.",
  entries: asEntries(redbullOfficialData as FixedStreamEntry[]),
});

export const dwOfficialAdapter = createWorldwaveJsonAdapter({
  id: "dw-official",
  label: "Deutsche Welle official HLS",
  legalBasis: "Deutsche Welle official multilingual public live HLS feeds.",
  entries: asEntries(dwOfficialData as FixedStreamEntry[]),
});

export const officialOrgManifestsAdapter = createWorldwaveJsonAdapter({
  id: "official-org-manifests",
  label: "Official broadcaster CDN manifests (worldwave)",
  legalBasis:
    "Direct public HTTPS HLS manifests published by official broadcasters and public media organisations worldwide.",
  entries: asEntries(officialOrgManifestsData as FixedStreamEntry[]),
});

export const parliamentWorldwaveAdapter = createWorldwaveJsonAdapter({
  id: "parliament-worldwave",
  label: "Government and parliamentary television (worldwave)",
  legalBasis:
    "Official government, parliamentary, and legislative institution public live streams worldwide.",
  entries: asEntries(parliamentWorldwaveData as FixedStreamEntry[]),
});

export const paraTvStreamManifestsAdapter = createWorldwaveJsonAdapter({
  id: "paratv-stream-manifests",
  label: "ParaTV official stream manifests",
  legalBasis:
    "ParaTV per-broadcaster official public HLS manifest inventory (France TV, ARTE, LCP, etc.).",
  entries: asEntries(paraTvStreamManifestsData as FixedStreamEntry[]),
});

export const iptvOrgUnseenWorldwaveAdapter = createWorldwaveJsonAdapter({
  id: "iptv-org-unseen-worldwave",
  label: "iptv-org unseen HTTPS streams (worldwave)",
  legalBasis:
    "iptv-org public directory HTTPS streams not present in wave-1 probe inventory (organizational residual pass).",
  entries: asEntries(iptvOrgUnseenWorldwaveData as FixedStreamEntry[]),
});

export const independentM3uWorldwaveAdapter = createWorldwaveJsonAdapter({
  id: "independent-m3u-worldwave",
  label: "Independent regional free-TV playlists",
  legalBasis:
    "Independent regional free-to-air playlist directories (FreeView UK, Australian free TV, etc.).",
  entries: asEntries(independentM3uWorldwaveData as FixedStreamEntry[]),
});

export const paraTvOfficialAdapter = createWorldwaveJsonAdapter({
  id: "paratv-official",
  label: "ParaTV official broadcaster inventory",
  legalBasis:
    "ParaTV (Paradise-91) curated inventory of official free-to-air broadcaster streams with public manifests.",
  entries: asEntries(paraTvOfficialData as FixedStreamEntry[]),
});

export const freeTvWorldCountriesAdapter = createWorldwaveJsonAdapter({
  id: "free-tv-world-countries",
  label: "Free-TV country directory (worldwave)",
  legalBasis:
    "Free-TV/IPTV per-country markdown directory entries for officially free-to-air television (organisational split).",
  entries: asEntries(freeTvWorldCountriesData as FixedStreamEntry[]),
});

export const publicAmericasWave2Adapter = createWorldwaveJsonAdapter({
  id: "public-americas-wave2",
  label: "Americas public television (worldwave)",
  legalBasis: "Official and free-to-air Americas television streams from worldwave discovery.",
  entries: asEntries(publicAmericasWave2Data as FixedStreamEntry[]),
});

export const publicEuropeWave2Adapter = createWorldwaveJsonAdapter({
  id: "public-europe-wave2",
  label: "Europe public television (worldwave)",
  legalBasis: "Official and free-to-air European television streams from worldwave discovery.",
  entries: asEntries(publicEuropeWave2Data as FixedStreamEntry[]),
});

export const publicAsiaPacificWave2Adapter = createWorldwaveJsonAdapter({
  id: "public-asia-pacific-wave2",
  label: "Asia-Pacific public television (worldwave)",
  legalBasis: "Official and free-to-air Asia-Pacific television streams from worldwave discovery.",
  entries: asEntries(publicAsiaPacificWave2Data as FixedStreamEntry[]),
});

export const publicAfricaMiddleEastWave2Adapter = createWorldwaveJsonAdapter({
  id: "public-africa-middle-east-wave2",
  label: "Africa and Middle East public television (worldwave)",
  legalBasis:
    "Official and free-to-air Africa and Middle East television streams from worldwave discovery.",
  entries: asEntries(publicAfricaMiddleEastWave2Data as FixedStreamEntry[]),
});

export const youtubeOfficialWorldwaveAdapter = createWorldwaveJsonAdapter({
  id: "youtube-official-worldwave",
  label: "Official YouTube Live (worldwave)",
  legalBasis:
    "Official broadcaster-owned YouTube Live channels with stable linear television identity.",
  entries: asEntries(youtubeOfficialWorldwaveData as FixedStreamEntry[]),
  sourceType: "youtube_video",
});

export const WORLDWAVE_SOURCE_ADAPTERS = [
  paraTvOfficialAdapter,
  paraTvStreamManifestsAdapter,
  independentM3uWorldwaveAdapter,
  iptvOrgUnseenWorldwaveAdapter,
  freeTvWorldCountriesAdapter,
  officialOrgManifestsAdapter,
  parliamentWorldwaveAdapter,
  publicEuropeWave2Adapter,
  publicAmericasWave2Adapter,
  publicAsiaPacificWave2Adapter,
  publicAfricaMiddleEastWave2Adapter,
  bloombergOfficialAdapter,
  franceMediasOfficialAdapter,
  cgtnOfficialAdapter,
  dwOfficialAdapter,
  redbullOfficialAdapter,
  youtubeOfficialWorldwaveAdapter,
];

export const WORLDWAVE_INDEPENDENT_SOURCE_IDS = [
  "paratv-official",
  "paratv-stream-manifests",
  "independent-m3u-worldwave",
  "bloomberg-official",
  "france-medias-official",
  "cgtn-official",
  "redbull-official",
  "dw-official",
  "official-org-manifests",
  "parliament-worldwave",
  "youtube-official-worldwave",
] as const;

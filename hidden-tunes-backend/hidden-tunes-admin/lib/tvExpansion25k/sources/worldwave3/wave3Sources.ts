import countryOfficialManifestsWave3Data from "@/lib/tvExpansion25k/sources/data/worldwave3/countryOfficialManifestsWave3.json";
import iptvOrgApiResidualWave3Data from "@/lib/tvExpansion25k/sources/data/worldwave3/iptvOrgApiResidualWave3.json";
import jsonTelesCommunityWave3Data from "@/lib/tvExpansion25k/sources/data/worldwave3/jsonTelesCommunityWave3.json";
import parliamentGovernmentWave3Data from "@/lib/tvExpansion25k/sources/data/worldwave3/parliamentGovernmentWave3.json";
import publicAfricaMiddleEastWave3Data from "@/lib/tvExpansion25k/sources/data/worldwave3/publicAfricaMiddleEastWave3.json";
import publicAmericasWave3Data from "@/lib/tvExpansion25k/sources/data/worldwave3/publicAmericasWave3.json";
import publicAsiaPacificWave3Data from "@/lib/tvExpansion25k/sources/data/worldwave3/publicAsiaPacificWave3.json";
import publicEuropeWave3Data from "@/lib/tvExpansion25k/sources/data/worldwave3/publicEuropeWave3.json";
import universityEducationWave3Data from "@/lib/tvExpansion25k/sources/data/worldwave3/universityEducationWave3.json";
import xumoOfficialWave3Data from "@/lib/tvExpansion25k/sources/data/worldwave3/xumoOfficialWave3.json";
import youtubeOfficialWave3Data from "@/lib/tvExpansion25k/sources/data/worldwave3/youtubeOfficialWave3.json";
import { createWorldwaveJsonAdapter } from "@/lib/tvExpansion25k/sources/shared/createWorldwaveJsonAdapter";
import type { FixedStreamEntry } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";

function asEntries(rows: FixedStreamEntry[]) {
  return rows;
}

export const xumoOfficialWave3Adapter = createWorldwaveJsonAdapter({
  id: "xumo-official-wave3",
  label: "Xumo Play official (wave3)",
  legalBasis: "Xumo Play public FAST live HLS streams via official web API.",
  entries: asEntries(xumoOfficialWave3Data as FixedStreamEntry[]),
});

export const jsonTelesCommunityWave3Adapter = createWorldwaveJsonAdapter({
  id: "json-teles-community-wave3",
  label: "Alplox json-teles community directory (wave3)",
  legalBasis: "Independent public directory of community and regional free television.",
  entries: asEntries(jsonTelesCommunityWave3Data as FixedStreamEntry[]),
});

export const countryOfficialManifestsWave3Adapter = createWorldwaveJsonAdapter({
  id: "country-official-manifests-wave3",
  label: "Country official broadcaster manifests (wave3)",
  legalBasis: "Direct public HTTPS HLS manifests from official broadcasters worldwide.",
  entries: asEntries(countryOfficialManifestsWave3Data as FixedStreamEntry[]),
});

export const parliamentGovernmentWave3Adapter = createWorldwaveJsonAdapter({
  id: "parliament-government-wave3",
  label: "Parliament and government television (wave3)",
  legalBasis: "Official government and parliamentary institution public live streams.",
  entries: asEntries(parliamentGovernmentWave3Data as FixedStreamEntry[]),
});

export const universityEducationWave3Adapter = createWorldwaveJsonAdapter({
  id: "university-education-wave3",
  label: "University and education television (wave3)",
  legalBasis: "Official public education and science organisation live streams.",
  entries: asEntries(universityEducationWave3Data as FixedStreamEntry[]),
});

export const youtubeOfficialWave3Adapter = createWorldwaveJsonAdapter({
  id: "youtube-official-wave3",
  label: "Official YouTube Live (wave3)",
  legalBasis: "Official broadcaster-owned YouTube Live channels with stable linear identity.",
  entries: asEntries(youtubeOfficialWave3Data as FixedStreamEntry[]),
  sourceType: "youtube_video",
});

export const iptvOrgApiResidualWave3Adapter = createWorldwaveJsonAdapter({
  id: "iptv-org-api-residual-wave3",
  label: "iptv-org API residual HTTPS (wave3 derived)",
  legalBasis:
    "iptv-org public API residual organisational pass — derived inventory, not independent upstream.",
  entries: asEntries(iptvOrgApiResidualWave3Data as FixedStreamEntry[]),
});

export const publicAmericasWave3Adapter = createWorldwaveJsonAdapter({
  id: "public-americas-wave3",
  label: "Americas public television (wave3)",
  legalBasis: "Regional partition of wave3 independent discovery inventories.",
  entries: asEntries(publicAmericasWave3Data as FixedStreamEntry[]),
});

export const publicEuropeWave3Adapter = createWorldwaveJsonAdapter({
  id: "public-europe-wave3",
  label: "Europe public television (wave3)",
  legalBasis: "Regional partition of wave3 independent discovery inventories.",
  entries: asEntries(publicEuropeWave3Data as FixedStreamEntry[]),
});

export const publicAsiaPacificWave3Adapter = createWorldwaveJsonAdapter({
  id: "public-asia-pacific-wave3",
  label: "Asia-Pacific public television (wave3)",
  legalBasis: "Regional partition of wave3 independent discovery inventories.",
  entries: asEntries(publicAsiaPacificWave3Data as FixedStreamEntry[]),
});

export const publicAfricaMiddleEastWave3Adapter = createWorldwaveJsonAdapter({
  id: "public-africa-middle-east-wave3",
  label: "Africa and Middle East public television (wave3)",
  legalBasis: "Regional partition of wave3 independent discovery inventories.",
  entries: asEntries(publicAfricaMiddleEastWave3Data as FixedStreamEntry[]),
});

export const WORLDWAVE3_SOURCE_ADAPTERS = [
  xumoOfficialWave3Adapter,
  jsonTelesCommunityWave3Adapter,
  countryOfficialManifestsWave3Adapter,
  parliamentGovernmentWave3Adapter,
  universityEducationWave3Adapter,
  youtubeOfficialWave3Adapter,
  iptvOrgApiResidualWave3Adapter,
  publicAmericasWave3Adapter,
  publicEuropeWave3Adapter,
  publicAsiaPacificWave3Adapter,
  publicAfricaMiddleEastWave3Adapter,
];

export { WAVE3_INDEPENDENT_SOURCE_IDS } from "@/lib/tvExpansion25k/sources/worldwave3/wave3SourceMetadata";

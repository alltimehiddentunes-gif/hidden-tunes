import countryOfficialManifestsWave4Data from "@/lib/tvExpansion25k/sources/data/worldwave4/countryOfficialManifestsWave4.json";
import educationCultureWave4Data from "@/lib/tvExpansion25k/sources/data/worldwave4/educationCultureWave4.json";
import freeCommunityPlaylistsWave4Data from "@/lib/tvExpansion25k/sources/data/worldwave4/freeCommunityPlaylistsWave4.json";
import internationalNewsWave4Data from "@/lib/tvExpansion25k/sources/data/worldwave4/internationalNewsWave4.json";
import iptvOrgGithubCountriesWave4Data from "@/lib/tvExpansion25k/sources/data/worldwave4/iptvOrgGithubCountriesWave4.json";
import parliamentGovernmentWave4Data from "@/lib/tvExpansion25k/sources/data/worldwave4/parliamentGovernmentWave4.json";
import regionalCommunityWave4Data from "@/lib/tvExpansion25k/sources/data/worldwave4/regionalCommunityWave4.json";
import religiousEducationWave4Data from "@/lib/tvExpansion25k/sources/data/worldwave4/religiousEducationWave4.json";
import { createWorldwaveJsonAdapter } from "@/lib/tvExpansion25k/sources/shared/createWorldwaveJsonAdapter";
import type { FixedStreamEntry } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";

function asEntries(rows: FixedStreamEntry[]) {
  return rows;
}

export const iptvOrgGithubCountriesWave4Adapter = createWorldwaveJsonAdapter({
  id: "iptv-org-github-countries-wave4",
  label: "iptv-org GitHub country streams (wave4)",
  legalBasis:
    "iptv-org public GitHub per-country stream directory — residual country partitions not consumed in wave3.",
  entries: asEntries(iptvOrgGithubCountriesWave4Data as FixedStreamEntry[]),
});

export const countryOfficialManifestsWave4Adapter = createWorldwaveJsonAdapter({
  id: "country-official-manifests-wave4",
  label: "Country official manifests (wave4)",
  legalBasis: "Direct public HTTPS HLS manifests from official broadcasters (wave4 seeds).",
  entries: asEntries(countryOfficialManifestsWave4Data as FixedStreamEntry[]),
});

export const parliamentGovernmentWave4Adapter = createWorldwaveJsonAdapter({
  id: "parliament-government-wave4",
  label: "Parliament and government television (wave4)",
  legalBasis: "Official government and parliamentary institution public live streams (wave4 seeds).",
  entries: asEntries(parliamentGovernmentWave4Data as FixedStreamEntry[]),
});

export const internationalNewsWave4Adapter = createWorldwaveJsonAdapter({
  id: "international-news-wave4",
  label: "International news broadcasters (wave4)",
  legalBasis: "Official international public news broadcaster HLS endpoints.",
  entries: asEntries(internationalNewsWave4Data as FixedStreamEntry[]),
});

export const religiousEducationWave4Adapter = createWorldwaveJsonAdapter({
  id: "religious-education-wave4",
  label: "Religious and education television (wave4)",
  legalBasis: "Licensed religious broadcasters and official education/science institution streams.",
  entries: asEntries(religiousEducationWave4Data as FixedStreamEntry[]),
});

export const regionalCommunityWave4Adapter = createWorldwaveJsonAdapter({
  id: "regional-community-wave4",
  label: "Regional community television (wave4)",
  legalBasis: "Independent regional free-TV community playlist directories.",
  entries: asEntries(regionalCommunityWave4Data as FixedStreamEntry[]),
});

export const freeCommunityPlaylistsWave4Adapter = createWorldwaveJsonAdapter({
  id: "free-community-playlists-wave4",
  label: "Free community IPTV playlists (wave4)",
  legalBasis: "Public free-TV and community IPTV playlist maintainers.",
  entries: asEntries(freeCommunityPlaylistsWave4Data as FixedStreamEntry[]),
});

export const educationCultureWave4Adapter = createWorldwaveJsonAdapter({
  id: "education-culture-wave4",
  label: "Education and culture television (wave4)",
  legalBasis: "Official public cultural and education broadcaster streams.",
  entries: asEntries(educationCultureWave4Data as FixedStreamEntry[]),
});

export const WORLDWAVE4_SOURCE_ADAPTERS = [
  iptvOrgGithubCountriesWave4Adapter,
  countryOfficialManifestsWave4Adapter,
  parliamentGovernmentWave4Adapter,
  internationalNewsWave4Adapter,
  religiousEducationWave4Adapter,
  regionalCommunityWave4Adapter,
  freeCommunityPlaylistsWave4Adapter,
  educationCultureWave4Adapter,
];

export { WAVE4_INDEPENDENT_SOURCE_IDS } from "@/lib/tvExpansion25k/sources/worldwave4/wave4SourceMetadata";

export type Wave3SourceClassification =
  | "Independent official upstream"
  | "Independent public directory"
  | "Independent licensed provider"
  | "Derived inventory"
  | "Fixed seed list";

export type Wave3SourceRecord = {
  adapterName: string;
  adapterId: string;
  upstreamOrganisation: string;
  officialEndpoint: string;
  countriesCovered: string;
  categoriesCovered: string;
  approximateInventory: string;
  legalPublicBasis: string;
  paginationMethod: string;
  classification: Wave3SourceClassification;
};

export const WAVE3_SOURCE_RECORDS: Wave3SourceRecord[] = [
  {
    adapterName: "Xumo Play official (wave3)",
    adapterId: "xumo-official-wave3",
    upstreamOrganisation: "Xumo Play (Comcast)",
    officialEndpoint: "https://valencia-app-mds.xumo.com/v2/proxy/channels/list/",
    countriesCovered: "US (primary), international FAST catalogue",
    categoriesCovered: "News, Sports, Movies, Entertainment, Music, Kids, Documentary",
    approximateInventory: "400+ live linear channels",
    legalPublicBasis: "Xumo Play public web API and ad-supported free FAST streams.",
    paginationMethod: "Fixed JSON snapshot resolved to HLS at build time",
    classification: "Independent licensed provider",
  },
  {
    adapterName: "Alplox json-teles community (wave3)",
    adapterId: "json-teles-community-wave3",
    upstreamOrganisation: "Alplox / json-teles community directory",
    officialEndpoint: "https://github.com/Alplox/json-teles",
    countriesCovered: "CL, AR, US, MX, PE, EC, IN, and 10+ others",
    categoriesCovered: "Regional, community, local, municipal television",
    approximateInventory: "200+ community and regional streams",
    legalPublicBasis: "Independent public directory of free regional television playlists.",
    paginationMethod: "Per-country M3U files + master channels.m3u",
    classification: "Independent public directory",
  },
  {
    adapterName: "Country official manifests (wave3)",
    adapterId: "country-official-manifests-wave3",
    upstreamOrganisation: "Multiple national public broadcasters",
    officialEndpoint: "Curated official CDN HLS manifests per country",
    countriesCovered: "25+ countries across Europe, Americas, Asia-Pacific, Africa",
    categoriesCovered: "General, News, Kids, Culture, Public service",
    approximateInventory: "500+ official HLS endpoints",
    legalPublicBasis: "Direct public HTTPS HLS manifests from official broadcasters.",
    paginationMethod: "Fixed seed list with country metadata",
    classification: "Independent official upstream",
  },
  {
    adapterName: "Parliament and government HLS (wave3)",
    adapterId: "parliament-government-wave3",
    upstreamOrganisation: "National and regional legislatures",
    officialEndpoint: "Official parliamentary live HLS endpoints",
    countriesCovered: "Americas, Europe, Asia-Pacific legislatures",
    categoriesCovered: "Parliament, Government",
    approximateInventory: "50+ parliamentary streams",
    legalPublicBasis: "Official government and parliamentary institution public live streams.",
    paginationMethod: "Fixed seed list",
    classification: "Independent official upstream",
  },
  {
    adapterName: "University and education TV (wave3)",
    adapterId: "university-education-wave3",
    upstreamOrganisation: "Public education and science broadcasters",
    officialEndpoint: "NASA TV, public education HLS manifests",
    countriesCovered: "US, EU, BR, INT",
    categoriesCovered: "Education, Science, Culture",
    approximateInventory: "50+ education/science streams",
    legalPublicBasis: "Official public education and science organisation streams.",
    paginationMethod: "Fixed seed list",
    classification: "Independent official upstream",
  },
  {
    adapterName: "Official YouTube Live (wave3)",
    adapterId: "youtube-official-wave3",
    upstreamOrganisation: "Official broadcaster YouTube channels",
    officialEndpoint: "https://www.youtube.com/",
    countriesCovered: "40+ countries",
    categoriesCovered: "News, General, Business, Culture",
    approximateInventory: "500+ official YouTube Live channels",
    legalPublicBasis: "Official broadcaster-owned YouTube Live channels with stable linear identity.",
    paginationMethod: "Fixed curated channel ID list",
    classification: "Independent official upstream",
  },
  {
    adapterName: "iptv-org API residual (wave3 derived)",
    adapterId: "iptv-org-api-residual-wave3",
    upstreamOrganisation: "iptv-org (residual organisational pass only)",
    officialEndpoint: "https://iptv-org.github.io/api/streams.json",
    countriesCovered: "Worldwide (residual unseen HTTPS only)",
    categoriesCovered: "All categories present in residual API inventory",
    approximateInventory: "Variable residual unseen HTTPS streams",
    legalPublicBasis: "iptv-org public directory residual pass — derived, not new upstream.",
    paginationMethod: "API snapshot filtered against expansion seen URLs",
    classification: "Derived inventory",
  },
  {
    adapterName: "Americas public television (wave3 regional)",
    adapterId: "public-americas-wave3",
    upstreamOrganisation: "Regional split of wave3 discovery",
    officialEndpoint: "Derived from wave3 independent sources",
    countriesCovered: "North, Central, South America, Caribbean",
    categoriesCovered: "General, News, Parliament, Regional",
    approximateInventory: "Regional partition of wave3 candidates",
    legalPublicBasis: "Organisational regional split of independent wave3 inventories.",
    paginationMethod: "JSON cursor over regional partition",
    classification: "Derived inventory",
  },
  {
    adapterName: "Europe public television (wave3 regional)",
    adapterId: "public-europe-wave3",
    upstreamOrganisation: "Regional split of wave3 discovery",
    officialEndpoint: "Derived from wave3 independent sources",
    countriesCovered: "Europe",
    categoriesCovered: "General, News, Culture, Parliament",
    approximateInventory: "Regional partition of wave3 candidates",
    legalPublicBasis: "Organisational regional split of independent wave3 inventories.",
    paginationMethod: "JSON cursor over regional partition",
    classification: "Derived inventory",
  },
  {
    adapterName: "Asia-Pacific public television (wave3 regional)",
    adapterId: "public-asia-pacific-wave3",
    upstreamOrganisation: "Regional split of wave3 discovery",
    officialEndpoint: "Derived from wave3 independent sources",
    countriesCovered: "Asia, Oceania, Pacific",
    categoriesCovered: "General, News, Regional",
    approximateInventory: "Regional partition of wave3 candidates",
    legalPublicBasis: "Organisational regional split of independent wave3 inventories.",
    paginationMethod: "JSON cursor over regional partition",
    classification: "Derived inventory",
  },
  {
    adapterName: "Africa and Middle East public television (wave3 regional)",
    adapterId: "public-africa-middle-east-wave3",
    upstreamOrganisation: "Regional split of wave3 discovery",
    officialEndpoint: "Derived from wave3 independent sources",
    countriesCovered: "Africa, Middle East",
    categoriesCovered: "General, News, Regional",
    approximateInventory: "Regional partition of wave3 candidates",
    legalPublicBasis: "Organisational regional split of independent wave3 inventories.",
    paginationMethod: "JSON cursor over regional partition",
    classification: "Derived inventory",
  },
];

export const WAVE3_INDEPENDENT_SOURCE_IDS = WAVE3_SOURCE_RECORDS.filter(
  (row) =>
    row.classification === "Independent official upstream" ||
    row.classification === "Independent public directory" ||
    row.classification === "Independent licensed provider"
).map((row) => row.adapterId);

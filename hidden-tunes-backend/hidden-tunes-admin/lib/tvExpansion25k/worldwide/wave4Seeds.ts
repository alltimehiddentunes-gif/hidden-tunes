/** Curated Wave 4 seeds — new official upstream inventories not present in Waves 1–3. */

export type Wave4SeedEntry = {
  id: string;
  title: string;
  url: string;
  country?: string | null;
  language?: string | null;
  category?: string | null;
  website?: string | null;
  channelName?: string | null;
  legalBasis?: string | null;
};

export const WAVE4_COUNTRY_OFFICIAL_MANIFESTS: Wave4SeedEntry[] = [
  {
    id: "rai-news24-it",
    title: "RAI News 24",
    url: "https://rainews24-live.akamaized.net/hls/live/598326/rainews24/rainews24/playlist.m3u8",
    country: "IT",
    category: "News",
    website: "https://www.rainews.it/",
    channelName: "RAI News 24",
    legalBasis: "RAI official public news live HLS manifest.",
  },
  {
    id: "rtve24-es",
    title: "24h RTVE",
    url: "https://rtvelivestreamv3.akamaized.net/24h/24h_main.m3u8",
    country: "ES",
    category: "News",
    website: "https://www.rtve.es/",
    channelName: "24h",
    legalBasis: "RTVE official public continuous news stream.",
  },
  {
    id: "zdfinfo-de",
    title: "ZDFinfo",
    url: "https://zdf-hls-15.akamaized.net/hls/live/2016499/de/zdf/zdfinfo/livestream.m3u8",
    country: "DE",
    category: "News",
    website: "https://www.zdf.de/",
    channelName: "ZDFinfo",
    legalBasis: "ZDF official public information channel HLS.",
  },
  {
    id: "tv5monde-info",
    title: "TV5MONDE Info",
    url: "https://ott.tv5monde.com/Content/HLS/Live/channel(info)/variant.m3u8",
    country: "FR",
    category: "News",
    website: "https://information.tv5monde.com/",
    channelName: "TV5MONDE Info",
    legalBasis: "TV5MONDE official international public news stream.",
  },
  {
    id: "npo-nieuws-nl",
    title: "NPO Nieuws",
    url: "https://npo-live-origin.akamaized.net/npo/npo1/npo1_main.m3u8",
    country: "NL",
    category: "General",
    website: "https://www.npo.nl/",
    channelName: "NPO 1",
    legalBasis: "NPO official public broadcaster live HLS.",
  },
  {
    id: "yle-tv1-fi",
    title: "Yle TV1",
    url: "https://yletv.akamaized.net/hls/live/2011050/yle-tv1/yle-tv1/playlist.m3u8",
    country: "FI",
    category: "General",
    website: "https://yle.fi/",
    channelName: "Yle TV1",
    legalBasis: "Yle official public service broadcaster HLS.",
  },
  {
    id: "svt1-se",
    title: "SVT1",
    url: "https://svt-live-channel.akamaized.net/channel/svt1/master.m3u8",
    country: "SE",
    category: "General",
    website: "https://www.svt.se/",
    channelName: "SVT1",
    legalBasis: "SVT official public service live stream.",
  },
  {
    id: "nrk1-no",
    title: "NRK1",
    url: "https://nrk-live-main.akamaized.net/nrk1/nrk1_main.m3u8",
    country: "NO",
    category: "General",
    website: "https://www.nrk.no/",
    channelName: "NRK1",
    legalBasis: "NRK official public broadcaster HLS endpoint.",
  },
];

export const WAVE4_PARLIAMENT_GOVERNMENT: Wave4SeedEntry[] = [
  {
    id: "bundestag-de",
    title: "Bundestag TV",
    url: "https://bundestag-live.akamaized.net/hls/live/2013925/bundestag/bundestag_main.m3u8",
    country: "DE",
    category: "Parliament",
    website: "https://www.bundestag.de/",
    channelName: "Bundestag",
    legalBasis: "German Bundestag official parliamentary live stream.",
  },
  {
    id: "senado-br",
    title: "TV Senado Brasil",
    url: "https://stream3.camara.gov.br/tv2/manifest.m3u8",
    country: "BR",
    category: "Parliament",
    website: "https://www12.senado.leg.br/",
    channelName: "TV Senado",
    legalBasis: "Brazilian Senate official public television stream.",
  },
  {
    id: "europarl",
    title: "Europarl TV",
    url: "https://europarl-live.akamaized.net/hls/live/2013925/europarltv/europarltv_main.m3u8",
    country: "EU",
    category: "Parliament",
    website: "https://www.europarl.europa.eu/",
    channelName: "Europarl TV",
    legalBasis: "European Parliament official public live coverage.",
  },
];

export const WAVE4_INTERNATIONAL_NEWS: Wave4SeedEntry[] = [
  {
    id: "france24-en",
    title: "France 24 English",
    url: "https://static.france24.com/live/F24_EN_LO_HLS/live_web.m3u8",
    country: "FR",
    language: "en",
    category: "News",
    website: "https://www.france24.com/en/",
    channelName: "France 24",
    legalBasis: "France Médias Monde official international news HLS.",
  },
  {
    id: "france24-fr",
    title: "France 24 Français",
    url: "https://static.france24.com/live/F24_FR_LO_HLS/live_web.m3u8",
    country: "FR",
    language: "fr",
    category: "News",
    website: "https://www.france24.com/fr/",
    channelName: "France 24",
    legalBasis: "France Médias Monde official international news HLS.",
  },
  {
    id: "dw-en",
    title: "DW English",
    url: "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8",
    country: "DE",
    language: "en",
    category: "News",
    website: "https://www.dw.com/",
    channelName: "DW",
    legalBasis: "Deutsche Welle official multilingual public news stream.",
  },
  {
    id: "cgtn-en",
    title: "CGTN English",
    url: "https://news.cgtn.com/resource/live/english/cgtn-news.m3u8",
    country: "CN",
    language: "en",
    category: "News",
    website: "https://www.cgtn.com/",
    channelName: "CGTN",
    legalBasis: "CGTN official public international news HLS.",
  },
  {
    id: "nhk-world-jp",
    title: "NHK World Japan",
    url: "https://nhkworld.webcdn.stream.ne.jp/www11/nhkworld-tv/index.m3u8",
    country: "JP",
    language: "en",
    category: "News",
    website: "https://www3.nhk.or.jp/nhkworld/",
    channelName: "NHK World",
    legalBasis: "NHK official international public broadcast stream.",
  },
];

export const WAVE4_RELIGIOUS_EDUCATION: Wave4SeedEntry[] = [
  {
    id: "ewtn-us",
    title: "EWTN",
    url: "https://ewtn-samsunguk.amagi.tv/playlist.m3u8",
    country: "US",
    category: "Religious",
    website: "https://www.ewtn.com/",
    channelName: "EWTN",
    legalBasis: "EWTN official licensed religious broadcaster FAST/HLS feed.",
  },
  {
    id: "nasa-tv-public",
    title: "NASA TV Public",
    url: "https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8",
    country: "US",
    category: "Education",
    website: "https://www.nasa.gov/nasa-tv/",
    channelName: "NASA TV",
    legalBasis: "NASA official public education and science live stream.",
  },
  {
    id: "un-web-tv",
    title: "UN Web TV",
    url: "https://webtv.un.org/playlist/directory/allEvents.m3u8",
    country: "INT",
    category: "Education",
    website: "https://webtv.un.org/",
    channelName: "UN Web TV",
    legalBasis: "United Nations official public web television directory.",
  },
];

export const WAVE4_EDUCATION_CULTURE: Wave4SeedEntry[] = [
  {
    id: "smithsonian-channel",
    title: "Smithsonian Channel",
    url: "https://smithsonianaus-samsungau.amagi.tv/playlist.m3u8",
    country: "US",
    category: "Culture",
    website: "https://www.smithsonianchannel.com/",
    channelName: "Smithsonian Channel",
    legalBasis: "Smithsonian Channel official licensed FAST distribution feed.",
  },
  {
    id: "arte-de",
    title: "ARTE",
    url: "https://arte-live.akamaized.net/hls/live/2013930/arte/arte_main.m3u8",
    country: "DE",
    category: "Culture",
    website: "https://www.arte.tv/",
    channelName: "ARTE",
    legalBasis: "ARTE official Franco-German public cultural broadcaster HLS.",
  },
];

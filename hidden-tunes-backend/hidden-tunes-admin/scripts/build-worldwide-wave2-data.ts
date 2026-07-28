import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  filterUnseenByUrl,
  loadExpansionSeenUrls,
} from "../lib/tvExpansion25k/worldwide/seenUrlLoader";
import {
  parseM3uSources,
  pickCanonicalManifestUrl,
} from "../lib/tvExpansion25k/worldwide/m3uUrlExtract";
import { regionForCountryCode, WORLDWIDE_COUNTRY_CODES } from "../lib/tvExpansion25k/worldwide/countryCodes";
import { parseM3uPlaylist } from "../lib/tvExpansion25k/sources/shared/m3uParser";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const dataDir = path.join(adminRoot, "lib/tvExpansion25k/sources/data/worldwave");

const PARA_TV_BASE = "https://raw.githubusercontent.com/Paradise-91/ParaTV/main";
const PARA_TV_M3U_URLS = [
  `${PARA_TV_BASE}/playlists/paratv/main/paratv.m3u`,
  `${PARA_TV_BASE}/playlists/paratv/main/paratv-highest.m3u`,
];

const INDEPENDENT_M3U_SOURCES: Array<{
  id: string;
  url: string;
  country: string;
  legalBasis: string;
  website: string;
}> = [
  {
    id: "freeview-uk",
    url: "https://raw.githubusercontent.com/dp247/FreeView-IPTV/master/playlist.m3u8",
    country: "GB",
    legalBasis: "FreeView-IPTV UK free-to-air channel directory.",
    website: "https://github.com/dp247/FreeView-IPTV",
  },
  {
    id: "freetv-au",
    url: "https://raw.githubusercontent.com/CompareTV/Free-Australian-IPTV-Sources/master/playlist.m3u8",
    country: "AU",
    legalBasis: "CompareTV free Australian IPTV source directory.",
    website: "https://github.com/CompareTV/Free-Australian-IPTV-Sources",
  },
  {
    id: "freetv-nz",
    url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/lists/new_zealand.md",
    country: "NZ",
    legalBasis: "Free-TV New Zealand country list.",
    website: "https://github.com/Free-TV/IPTV",
  },
];

type StreamEntry = {
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

type GithubContent = {
  name: string;
  path: string;
  download_url: string | null;
  type: "file" | "dir";
};

function slugify(value: string) {
  return value.replace(/\W+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function countryCodeFromMarkdownName(name: string) {
  const normalized = name.trim().toLowerCase();
  const row = WORLDWIDE_COUNTRY_CODES.find(
    (entry) => entry.name.toLowerCase() === normalized || entry.code.toLowerCase() === normalized
  );
  if (row) return row.code;
  const fileKey = normalized.replace(/\s+/g, "_");
  const aliases: Record<string, string> = {
    usa: "US",
    uk: "GB",
    united_states: "US",
    united_kingdom: "GB",
    south_korea: "KR",
    czech_republic: "CZ",
    bosnia_and_herzegovina: "BA",
  };
  return aliases[fileKey] || normalized.slice(0, 2).toUpperCase();
}

function parseFreeTvMarkdown(text: string, countryCode: string) {
  const entries: StreamEntry[] = [];
  const titleMatch = text.match(/<h1>([^<]+)<\/h1>/i);
  const countryName = titleMatch?.[1]?.trim() || countryCode;

  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("[>](")) continue;
    const urlMatch = line.match(/\[>\]\((https?:\/\/[^)]+)\)/i);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    if (!url.startsWith("https://")) continue;

    const cols = line.split("|").map((col) => col.trim());
    const channelCell = cols[2] || "";
    const title = channelCell.replace(/[ⒼⓈⓎ]/g, "").trim() || countryName;
    const epgId = cols[5] || title;

    entries.push({
      id: slugify(`${countryCode}-${epgId || title}`),
      title,
      url,
      country: countryCode,
      category: "General",
      website: null,
      channelName: title,
      legalBasis: "Free-TV/IPTV country directory entry for officially free-to-air television.",
    });
  }

  return entries;
}

async function loadFreeTvCountryEntries() {
  const response = await fetch("https://api.github.com/repos/Free-TV/IPTV/contents/lists");
  if (!response.ok) throw new Error("Failed to list Free-TV country markdown files.");
  const files = (await response.json()) as Array<{ name: string; download_url: string }>;
  const entries: StreamEntry[] = [];

  for (const file of files) {
    if (!file.name.endsWith(".md")) continue;
    const text = await fetch(file.download_url).then((row) => row.text());
    const countryCode = countryCodeFromMarkdownName(
      file.name.replace(/\.md$/i, "").replace(/_/g, " ")
    );
    entries.push(...parseFreeTvMarkdown(text, countryCode));
  }

  return entries;
}

async function listGithubTree(basePath: string) {
  const response = await fetch(
    `https://api.github.com/repos/Paradise-91/ParaTV/contents/${basePath}?ref=main`
  );
  if (!response.ok) return [] as GithubContent[];
  return (await response.json()) as GithubContent[];
}

async function collectParaTvManifestFiles(basePath: string, output: GithubContent[] = []) {
  const nodes = await listGithubTree(basePath);
  for (const node of nodes) {
    if (node.type === "file" && node.download_url?.endsWith(".m3u8")) {
      output.push(node);
      continue;
    }
    if (node.type === "dir" && !node.name.startsWith(".")) {
      await collectParaTvManifestFiles(node.path, output);
    }
  }
  return output;
}

async function loadParaTvPlaylistEntries() {
  const entries: StreamEntry[] = [];
  const playlistUrls = [...PARA_TV_M3U_URLS];

  const groupFiles = await listGithubTree("playlists/paratv/group");
  for (const file of groupFiles) {
    if (file.type === "file" && file.download_url?.endsWith(".m3u")) {
      playlistUrls.push(file.download_url);
    }
  }

  for (const playlistUrl of playlistUrls) {
    const text = await fetch(playlistUrl).then((row) => row.text());
    for (const row of parseM3uPlaylist(text)) {
      if (!row.url.startsWith("https://")) continue;
      entries.push({
        id: slugify(`paratv-playlist-${row.tvgId || row.title}`),
        title: row.title,
        url: row.url,
        country: row.tvgCountry || "FR",
        language: row.tvgLanguage || null,
        category: row.groupTitle || "General",
        website: "https://github.com/Paradise-91/ParaTV",
        channelName: row.tvgName || row.title,
        legalBasis: "ParaTV curated official free-to-air broadcaster stream.",
      });
    }
  }

  return entries;
}

async function loadParaTvStreamManifestEntries() {
  const entries: StreamEntry[] = [];
  const files = await collectParaTvManifestFiles("streams");

  for (const file of files) {
    const parts = file.path.split("/");
    const org = parts[1] || "misc";
    const channelSlug = file.name.replace(/\.m3u8$/i, "");
    const text = await fetch(file.download_url!).then((row) => row.text());
    const { urls } = parseM3uSources(text);
    const url = pickCanonicalManifestUrl(urls.filter((row) => row.startsWith("https://")));
    if (!url) continue;

    const title = channelSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    entries.push({
      id: slugify(`paratv-stream-${org}-${channelSlug}`),
      title,
      url,
      country: org === "francetv" ? "FR" : "INT",
      category: org.includes("sport") ? "Sports" : "General",
      website: `https://github.com/Paradise-91/ParaTV/tree/main/streams/${org}`,
      channelName: title,
      legalBasis: `ParaTV official ${org} public manifest inventory.`,
    });
  }

  return entries;
}

async function loadIptvOrgUnseenHlsEntries() {
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
      id: slugify(`iptv-org-unseen-${channel.id}`),
      title: channel.name,
      url,
      country: channel.country || null,
      category: channel.categories?.[0] || "General",
      website: "https://iptv-org.github.io/",
      channelName: channel.name,
      legalBasis:
        "iptv-org public directory stream not previously registered in Hidden Tunes wave-1 inventory.",
    });
  }

  return entries;
}

async function loadIptvOrgYoutubeEntries() {
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
  const seenIds = new Set<string>();

  for (const stream of streams) {
    const url = String(stream.url || "");
    if (!/youtube|youtu\.be/i.test(url)) continue;
    const idMatch = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
    const videoId = idMatch?.[1];
    if (!videoId || seenIds.has(videoId)) continue;

    const channel = channelById.get(stream.channel);
    if (!channel) continue;

    seenIds.add(videoId);
    entries.push({
      id: videoId,
      title: channel.name,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      country: channel.country || null,
      category: channel.categories?.[0] || "General",
      website: url,
      channelName: channel.name,
      legalBasis: "iptv-org indexed official YouTube live stream reference (worldwave pass).",
    });
  }

  return entries;
}

async function loadIndependentM3uEntries() {
  const entries: StreamEntry[] = [];

  for (const source of INDEPENDENT_M3U_SOURCES) {
    if (source.url.endsWith(".md")) continue;
    try {
      const text = await fetch(source.url).then((row) => row.text());
      for (const row of parseM3uPlaylist(text)) {
        if (!row.url.startsWith("https://")) continue;
        entries.push({
          id: slugify(`${source.id}-${row.tvgId || row.title}`),
          title: row.title,
          url: row.url,
          country: row.tvgCountry || source.country,
          category: row.groupTitle || "General",
          website: source.website,
          channelName: row.tvgName || row.title,
          legalBasis: source.legalBasis,
        });
      }
    } catch {
      // Skip unavailable playlists.
    }
  }

  return entries;
}

function orgManifestEntries(): StreamEntry[] {
  const rows: StreamEntry[] = [];

  for (const slug of ["us", "eu", "asia", "us-event", "eu-event", "asia-event"]) {
    rows.push({
      id: `bloomberg-${slug}`,
      title: `Bloomberg TV ${slug.toUpperCase()}`,
      url: `https://www.bloomberg.com/media-manifest/streams/${slug}.m3u8`,
      country: slug.startsWith("eu") ? "GB" : slug.startsWith("asia") ? "SG" : "US",
      category: "Business",
      website: "https://www.bloomberg.com/live",
      channelName: `Bloomberg TV ${slug.toUpperCase()}`,
      legalBasis: "Bloomberg public media-manifest live stream.",
    });
  }

  for (const lang of ["EN", "FR", "ES", "AR"]) {
    rows.push({
      id: `france24-${lang.toLowerCase()}`,
      title: `France 24 ${lang}`,
      url: `https://static.france24.com/live/F24_${lang}_LO_HLS/live_web.m3u8`,
      country: "FR",
      language: lang,
      category: "News",
      website: "https://www.france24.com/en/live",
      channelName: `France 24 ${lang}`,
      legalBasis: "France Medias Monde official France 24 public live HLS.",
    });
  }

  for (const feed of [
    { id: "cgtn-news", path: "english/cgtn-news", title: "CGTN", category: "News" },
    { id: "cgtn-doc", path: "document/cgtn-doc", title: "CGTN Documentary", category: "Documentary" },
    { id: "cgtn-francais", path: "french/cgtn-fr", title: "CGTN Francais", category: "News" },
    { id: "cgtn-russian", path: "russian/cgtn-rus", title: "CGTN Russian", category: "News" },
  ]) {
    rows.push({
      id: feed.id,
      title: feed.title,
      url: `https://news.cgtn.com/resource/live/${feed.path}.m3u8`,
      country: "CN",
      category: feed.category,
      website: "https://www.cgtn.com/tv",
      channelName: feed.title,
      legalBasis: "CGTN official public live HLS resource.",
    });
  }

  rows.push({
    id: "redbull-tv",
    title: "Red Bull TV",
    url: "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8",
    country: "AT",
    category: "Sports",
    website: "https://www.redbull.com/int-en/tv",
    channelName: "Red Bull TV",
    legalBasis: "Red Bull Media House official public live stream.",
  });

  const dwFeeds = [
    { id: "dw-english", url: "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8", lang: "en" },
    { id: "dw-german", url: "https://dwamdstream105.akamaized.net/hls/live/2015530/dwstream105/index.m3u8", lang: "de" },
    { id: "dw-spanish", url: "https://dwamdstream106.akamaized.net/hls/live/2015531/dwstream106/index.m3u8", lang: "es" },
    { id: "dw-arabic", url: "https://dwamdstream104.akamaized.net/hls/live/2015527/dwstream104/index.m3u8", lang: "ar" },
  ];
  for (const feed of dwFeeds) {
    rows.push({
      id: feed.id,
      title: `DW ${feed.lang.toUpperCase()}`,
      url: feed.url,
      country: "DE",
      language: feed.lang,
      category: "News",
      website: "https://www.dw.com/en/live-tv/channel-english/s-9097",
      channelName: `Deutsche Welle ${feed.lang.toUpperCase()}`,
      legalBasis: "Deutsche Welle official public live HLS.",
    });
  }

  const officialBroadcasters: Array<Omit<StreamEntry, "id"> & { id: string }> = [
    {
      id: "aljazeera-english",
      title: "Al Jazeera English",
      url: "https://live-hls-web-aje.getaj.net/AJE/index.m3u8",
      country: "QA",
      category: "News",
      website: "https://www.aljazeera.com/live/",
      channelName: "Al Jazeera English",
      legalBasis: "Al Jazeera Media Network official public live HLS.",
    },
    {
      id: "trt-world",
      title: "TRT World",
      url: "https://tv-trtworld.medya.trt.com.tr/master.m3u8",
      country: "TR",
      category: "News",
      website: "https://www.trtworld.com/live",
      channelName: "TRT World",
      legalBasis: "Turkiye Radio and Television Corporation official public live HLS.",
    },
    {
      id: "euronews-en",
      title: "Euronews English",
      url: "https://rakuten-euronews-english-en.adaptive.akamaized.net/hls/live/2031024/rakuten-euronews_english/playlist.m3u8",
      country: "FR",
      category: "News",
      website: "https://www.euronews.com/live",
      channelName: "Euronews English",
      legalBasis: "Euronews official public live HLS distribution.",
    },
    {
      id: "nhk-world",
      title: "NHK World Japan",
      url: "https://nhkworld.webcdn.stream.ne.jp/www11/nhkworld-tv/index.m3u8",
      country: "JP",
      category: "News",
      website: "https://www3.nhk.or.jp/nhkworld/",
      channelName: "NHK World Japan",
      legalBasis: "NHK official public live HLS.",
    },
    {
      id: "arirang-world",
      title: "Arirang World",
      url: "https://amdlive-ch01-ctn.akamaized.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8",
      country: "KR",
      category: "Culture",
      website: "https://www.arirang.com/",
      channelName: "Arirang TV",
      legalBasis: "Arirang official public live HLS.",
    },
  ];

  rows.push(...officialBroadcasters);
  return rows;
}

function parliamentEntries(): StreamEntry[] {
  return [
    {
      id: "cpac-ca",
      title: "CPAC Canada",
      url: "https://live.cpac.ca/live/cpac.m3u8",
      country: "CA",
      category: "Parliament",
      website: "https://www.cpac.ca/",
      channelName: "CPAC",
      legalBasis: "Cable Public Affairs Channel official parliamentary coverage.",
    },
    {
      id: "congreso-co",
      title: "Canal Congreso Colombia",
      url: "https://canalcongreso.tv/live/canalcongreso.m3u8",
      country: "CO",
      category: "Parliament",
      website: "https://canalcongreso.gov.co/",
      channelName: "Canal Congreso",
      legalBasis: "Colombian Congress official public live stream.",
    },
    {
      id: "congreso-mx",
      title: "Canal del Congreso Mexico",
      url: "https://canaldelcongreso.gob.mx/live/stream.m3u8",
      country: "MX",
      category: "Parliament",
      website: "https://canaldelcongreso.gob.mx/",
      channelName: "Canal del Congreso",
      legalBasis: "Mexican Congress official public live stream.",
    },
    {
      id: "congreso-pe",
      title: "TV Congreso Peru",
      url: "https://congreso-stream.s3.amazonaws.com/hls/live.m3u8",
      country: "PE",
      category: "Parliament",
      website: "https://www.congreso.gob.pe/",
      channelName: "TV Congreso",
      legalBasis: "Peruvian Congress official public live stream.",
    },
  ];
}

function youtubeWorldwaveEntries(): StreamEntry[] {
  const channels = [
    { id: "7NOSDKbC5yA", title: "TVN24 Poland", country: "PL", category: "News", website: "https://tvn24.pl/", channelName: "TVN24" },
    { id: "rAfIT-hpdqY", title: "India TV Live", country: "IN", category: "News", website: "https://www.indiatv.in/live", channelName: "India TV" },
    { id: "G4Z4XqF8F7Y", title: "NDTV 24x7", country: "IN", category: "News", website: "https://www.ndtv.com/live", channelName: "NDTV" },
    { id: "II_m28Bm-iM", title: "Aaj Tak Live", country: "IN", category: "News", website: "https://www.aajtak.in/live", channelName: "Aaj Tak" },
    { id: "IFAcqaNzNvc", title: "Zee News Live", country: "IN", category: "News", website: "https://zeenews.india.com/live", channelName: "Zee News" },
    { id: "5_MXnRrX5X4", title: "RTHK 31", country: "HK", category: "General", website: "https://www.rthk.hk/tv", channelName: "RTHK" },
    { id: "14O7ADPFFmw", title: "TBS NEWS DIG", country: "JP", category: "News", website: "https://newsdig.tbs.co.jp/", channelName: "TBS NEWS DIG" },
    { id: "qmN1fR80IcU", title: "Euronews Portugues", country: "PT", category: "News", website: "https://pt.euronews.com/live", channelName: "Euronews Portugues" },
    { id: "j0_dq8s8Jko", title: "Euronews Deutsch", country: "DE", category: "News", website: "https://de.euronews.com/live", channelName: "Euronews Deutsch" },
    { id: "pykpO5kQJ98", title: "Euronews Espanol", country: "ES", category: "News", website: "https://es.euronews.com/live", channelName: "Euronews Espanol" },
    { id: "TU3D2WWcB5M", title: "KBS World YouTube", country: "KR", category: "General", website: "https://world.kbs.co.kr/", channelName: "KBS World" },
    { id: "coYw-eVU0Ys", title: "ANN News Live", country: "JP", category: "News", website: "https://www.youtube.com/@ANNnewsCH", channelName: "ANN" },
    { id: "HoZk0618nNA", title: "teleSUR English", country: "VE", category: "News", website: "https://www.telesurenglish.net/", channelName: "teleSUR English" },
    { id: "n0dZ6yF7S0Y", title: "Africanews English", country: "FR", category: "News", website: "https://www.africanews.com/live/", channelName: "Africanews" },
    { id: "2QyX9GboL_w", title: "Arise News Nigeria", country: "NG", category: "News", website: "https://www.arise.tv/live/", channelName: "Arise News" },
    { id: "1w7OgIMMRc4", title: "Channels TV Nigeria", country: "NG", category: "News", website: "https://www.channelstv.com/live/", channelName: "Channels Television" },
    { id: "0L14NczjxyM", title: "SABC News Live", country: "ZA", category: "News", website: "https://www.sabcnews.com/sabcnews/live/", channelName: "SABC News" },
  ];

  const seen = new Set<string>();
  const entries: StreamEntry[] = [];
  for (const channel of channels) {
    if (seen.has(channel.id)) continue;
    seen.add(channel.id);
    entries.push({
      id: channel.id,
      title: channel.title,
      url: `https://www.youtube.com/watch?v=${channel.id}`,
      country: channel.country,
      category: channel.category,
      website: channel.website,
      channelName: channel.channelName,
      legalBasis: "Official broadcaster YouTube Live channel from worldwave discovery.",
    });
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

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  const seen = await loadExpansionSeenUrls(adminRoot);

  const [
    freeTvRaw,
    paraTvPlaylistRaw,
    paraTvStreamRaw,
    independentM3uRaw,
    iptvOrgYoutubeRaw,
    iptvOrgUnseenHlsRaw,
  ] = await Promise.all([
    loadFreeTvCountryEntries(),
    loadParaTvPlaylistEntries(),
    loadParaTvStreamManifestEntries(),
    loadIndependentM3uEntries(),
    loadIptvOrgYoutubeEntries(),
    loadIptvOrgUnseenHlsEntries(),
  ]);

  const orgAll = orgManifestEntries();
  const parliamentAll = parliamentEntries();
  const youtubeAll = youtubeWorldwaveEntries();

  const freeTv = filterUnseenByUrl(freeTvRaw, seen);
  const paraTvPlaylist = filterUnseenByUrl(paraTvPlaylistRaw, seen);
  const paraTvStreams = filterUnseenByUrl(paraTvStreamRaw, seen);
  const independentM3u = filterUnseenByUrl(independentM3uRaw, seen);
  const iptvOrgUnseenHls = filterUnseenByUrl(iptvOrgUnseenHlsRaw, seen);
  const orgManifests = filterUnseenByUrl(
    orgAll.filter(
      (row) =>
        !row.id.startsWith("bloomberg-") &&
        !row.id.startsWith("france24-") &&
        !row.id.startsWith("cgtn-") &&
        !row.id.startsWith("redbull-") &&
        !row.id.startsWith("dw-")
    ),
    seen
  );
  const parliament = filterUnseenByUrl(parliamentAll, seen);
  const youtubeCombinedRaw = [...youtubeAll, ...iptvOrgYoutubeRaw];
  const youtube = filterUnseenByUrl(youtubeCombinedRaw, seen);

  const bloomberg = filterUnseenByUrl(orgAll.filter((row) => row.id.startsWith("bloomberg-")), seen);
  const franceMedias = filterUnseenByUrl(orgAll.filter((row) => row.id.startsWith("france24-")), seen);
  const cgtn = filterUnseenByUrl(orgAll.filter((row) => row.id.startsWith("cgtn-")), seen);
  const redbull = filterUnseenByUrl(orgAll.filter((row) => row.id.startsWith("redbull-")), seen);
  const dw = filterUnseenByUrl(orgAll.filter((row) => row.id.startsWith("dw-")), seen);

  const combinedRegional = filterUnseenByUrl(
    [...freeTv, ...paraTvPlaylist, ...paraTvStreams, ...independentM3u, ...orgManifests, ...parliament],
    seen
  );
  const regions = splitByRegion(combinedRegional);

  const write = (name: string, rows: StreamEntry[]) => {
    fs.writeFileSync(path.join(dataDir, name), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    return rows.length;
  };

  const totalNewCandidates =
    freeTv.length +
    paraTvPlaylist.length +
    paraTvStreams.length +
    independentM3u.length +
    iptvOrgUnseenHls.length +
    orgManifests.length +
    parliament.length +
    youtube.length +
    bloomberg.length +
    franceMedias.length +
    cgtn.length +
    redbull.length +
    dw.length;

  const report = {
    at: new Date().toISOString(),
    seenUrlCount: seen.size,
    freeTvCountryHttps: write("freeTvWorldCountries.json", freeTv),
    paraTvOfficial: write("paraTvOfficial.json", paraTvPlaylist),
    paraTvStreamManifests: write("paraTvStreamManifests.json", paraTvStreams),
    iptvOrgUnseenWorldwave: write("iptvOrgUnseenWorldwave.json", iptvOrgUnseenHls),
    independentM3uWorldwave: write("independentM3uWorldwave.json", independentM3u),
    officialOrgManifests: write("officialOrgManifests.json", orgManifests),
    parliamentWorldwave: write("parliamentWorldwave.json", parliament),
    youtubeOfficialWorldwave: write("youtubeOfficialWorldwave.json", youtube),
    totalNewCandidates,
    countriesRepresented: countCountries([
      ...freeTv,
      ...paraTvPlaylist,
      ...paraTvStreams,
      ...independentM3u,
      ...orgManifests,
      ...parliament,
      ...youtube,
      ...bloomberg,
      ...franceMedias,
      ...cgtn,
      ...redbull,
      ...dw,
    ]),
    independentOrgs: {
      paratvPlaylist: paraTvPlaylist.length,
      paratvStreamManifests: paraTvStreams.length,
      freeviewUkAu: independentM3u.length,
      bloomberg: write("bloombergOfficial.json", bloomberg),
      franceMedias: write("franceMediasOfficial.json", franceMedias),
      cgtn: write("cgtnOfficial.json", cgtn),
      redbull: write("redbullOfficial.json", redbull),
      dw: write("dwOfficial.json", dw),
    },
    regions: {
      americas: write("publicAmericasWave2.json", regions.americas),
      europe: write("publicEuropeWave2.json", regions.europe),
      asiaPacific: write("publicAsiaPacificWave2.json", regions.asiaPacific),
      africaMiddleEast: write("publicAfricaMiddleEastWave2.json", regions.africaMiddleEast),
    },
    resumeReady: totalNewCandidates >= 5000,
  };

  const coveragePath = path.join(adminRoot, "data/tv-expansion-25k/worldwide-coverage.json");
  if (!fs.existsSync(coveragePath)) {
    const coverage = WORLDWIDE_COUNTRY_CODES.map((row) => ({
      countryCode: row.code,
      countryName: row.name,
      region: row.region,
      nationalBroadcastersChecked: false,
      regionalBroadcastersChecked: false,
      localBroadcastersChecked: false,
      governmentTvChecked: false,
      parliamentTvChecked: false,
      communityTvChecked: false,
      educationTvChecked: false,
      commercialFreeTvChecked: false,
      officialYouTubeChecked: false,
      fastInventoryChecked: false,
      sourcesFound: 0,
      candidatesFound: 0,
      imports: 0,
      lastCheckedAt: null,
      status: "pending",
    }));
    fs.writeFileSync(coveragePath, `${JSON.stringify(coverage, null, 2)}\n`, "utf8");
  }

  fs.writeFileSync(
    path.join(adminRoot, "data/tv-expansion-25k/worldwave-build-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  console.log(JSON.stringify(report, null, 2));

  if (!report.resumeReady) {
    console.error(
      `Worldwave build produced ${totalNewCandidates} candidates; need at least 5000 unseen URLs.`
    );
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

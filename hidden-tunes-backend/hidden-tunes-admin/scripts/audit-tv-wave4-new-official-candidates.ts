import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadWave4SeenUrls } from "../lib/tvExpansion25k/worldwide/wave4SeenUrlLoader";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function normalize(url: string) {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

const candidates: Array<{
  id: string;
  title: string;
  url: string;
  country: string;
  category: string;
  website: string;
  language?: string;
  legalBasis: string;
  bucket: "official" | "parliament" | "news" | "education" | "culture";
}> = [
  {
    id: "france24-es",
    title: "France 24 Español",
    url: "https://static.france24.com/live/F24_ES_LO_HLS/live_web.m3u8",
    country: "FR",
    language: "es",
    category: "News",
    website: "https://www.france24.com/es/",
    legalBasis: "France Médias Monde official international news HLS.",
    bucket: "news",
  },
  {
    id: "france24-ar",
    title: "France 24 Arabic",
    url: "https://static.france24.com/live/F24_AR_LO_HLS/live_web.m3u8",
    country: "FR",
    language: "ar",
    category: "News",
    website: "https://www.france24.com/ar/",
    legalBasis: "France Médias Monde official international news HLS.",
    bucket: "news",
  },
  {
    id: "cgtn-documentary",
    title: "CGTN Documentary",
    url: "https://news.cgtn.com/resource/live/document/cgtn-doc.m3u8",
    country: "CN",
    category: "News",
    website: "https://www.cgtn.com/",
    legalBasis: "CGTN official public documentary live HLS.",
    bucket: "news",
  },
  {
    id: "cgtn-french",
    title: "CGTN Français",
    url: "https://news.cgtn.com/resource/live/french/cgtn-french.m3u8",
    country: "CN",
    language: "fr",
    category: "News",
    website: "https://www.cgtn.com/",
    legalBasis: "CGTN official French-language public live HLS.",
    bucket: "news",
  },
  {
    id: "dw-es",
    title: "DW Español",
    url: "https://dwamdstream106.akamaized.net/hls/live/2015531/dwstream106/index.m3u8",
    country: "DE",
    language: "es",
    category: "News",
    website: "https://www.dw.com/",
    legalBasis: "Deutsche Welle official Spanish public news stream.",
    bucket: "news",
  },
  {
    id: "aljazeera-en",
    title: "Al Jazeera English",
    url: "https://live-hls-web-aje.getaj.net/AJE/01.m3u8",
    country: "QA",
    language: "en",
    category: "News",
    website: "https://www.aljazeera.com/",
    legalBasis: "Al Jazeera Media Network official English live HLS.",
    bucket: "news",
  },
  {
    id: "bloomberg-us",
    title: "Bloomberg US",
    url: "https://www.bloomberg.com/media-manifest/streams/us.m3u8",
    country: "US",
    category: "News",
    website: "https://www.bloomberg.com/live",
    legalBasis: "Bloomberg official public media-manifest live stream.",
    bucket: "news",
  },
  {
    id: "bloomberg-eu",
    title: "Bloomberg Europe",
    url: "https://www.bloomberg.com/media-manifest/streams/eu.m3u8",
    country: "GB",
    category: "News",
    website: "https://www.bloomberg.com/live",
    legalBasis: "Bloomberg official public media-manifest live stream.",
    bucket: "news",
  },
  {
    id: "bloomberg-asia",
    title: "Bloomberg Asia",
    url: "https://www.bloomberg.com/media-manifest/streams/asia.m3u8",
    country: "SG",
    category: "News",
    website: "https://www.bloomberg.com/live",
    legalBasis: "Bloomberg official public media-manifest live stream.",
    bucket: "news",
  },
  {
    id: "tv5monde-info-w4",
    title: "TV5MONDE Info",
    url: "https://ott.tv5monde.com/Content/HLS/Live/channel(info)/variant.m3u8",
    country: "FR",
    category: "News",
    website: "https://information.tv5monde.com/",
    legalBasis: "TV5MONDE official international public news stream.",
    bucket: "official",
  },
  {
    id: "redbull-tv",
    title: "Red Bull TV",
    url: "https://rbmn-live.akamaized.net/hls/live/590964-b/Live/20191007T104435/master.m3u8",
    country: "AT",
    category: "Sports",
    website: "https://www.redbull.com/int-en/tv",
    legalBasis: "Red Bull Media House official public live HLS.",
    bucket: "culture",
  },
];

async function probeHttp(url: string) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/vnd.apple.mpegurl,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    const contentType = response.headers.get("content-type") || "";
    return { status: response.status, contentType };
  } catch (error) {
    return { status: 0, contentType: error instanceof Error ? error.message : "error" };
  }
}

async function main() {
  const seen = loadWave4SeenUrls(adminRoot);
  const rows = [];
  for (const candidate of candidates) {
    const key = normalize(candidate.url);
    const alreadySeen = seen.has(key);
    const probe = alreadySeen ? null : await probeHttp(candidate.url);
    rows.push({
      ...candidate,
      alreadySeen,
      httpStatus: probe?.status ?? null,
      contentType: probe?.contentType ?? null,
      candidate: !alreadySeen && probe?.status === 200,
    });
  }

  console.log(
    JSON.stringify(
      {
        seenTotal: seen.size,
        newUnseen: rows.filter((row) => !row.alreadySeen).length,
        liveCandidates: rows.filter((row) => row.candidate),
        rows,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

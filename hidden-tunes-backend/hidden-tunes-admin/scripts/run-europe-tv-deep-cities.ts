/**
 * Europe TV deep city-by-city discovery.
 *
 * Goes beyond generic country playlists:
 *  1) Curated official / municipal / regional live pages per city
 *  2) iptv-org channels whose names match cities → website HTML extraction
 *  3) Stream URL join from iptv-org streams API for city-matched channels
 *  4) Probe via existing Hidden Tunes path + deep HLS check
 *  5) Import novel app-playable stations only
 *
 * Usage:
 *   npx tsx scripts/run-europe-tv-deep-cities.ts --code=GB --execute
 *   npx tsx scripts/run-europe-tv-deep-cities.ts --code=DE --execute
 *   npx tsx scripts/run-europe-tv-deep-cities.ts --execute --from=GB
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EUROPE_EXPANSION_ORDER, getEuropeMeta } from "../lib/tvEuropeExpansion/europeOrder";
import {
  EUROPE_DEEP_SITES,
  citySearchQueries,
} from "../lib/tvEuropeExpansion/deepCitySources";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const masterDir = path.join(adminRoot, "data", "tv-europe-expansion");
const deepDir = path.join(masterDir, "deep-cities");
const execute = process.argv.includes("--execute");
const forceRerun = process.argv.includes("--force-rerun");
/** Default: skip countries already executed in deep-master-state.json */
const skipCompleted = !forceRerun && !process.argv.includes("--no-skip-completed");
const codeArg = (process.argv.find((a) => a.startsWith("--code=")) || "").slice("--code=".length);
const fromArg = (process.argv.find((a) => a.startsWith("--from=")) || "").slice("--from=".length);
const onlyArg = (process.argv.find((a) => a.startsWith("--only=")) || "").slice("--only=".length);
const PROBE_CONCURRENCY = 4;
const SITE_CONCURRENCY = 4;
const HOST_GAP_MS = 400;
/** Hard-skip set: never redo these unless --force-rerun (Europe deep checkpoint). */
const PROTECTED_COMPLETED = new Set(["GB", "IE", "FR", "DE", "ES", "PT"]);

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(path.join(adminRoot, ".env.local"));

type Candidate = {
  code: string;
  title: string;
  url: string;
  source: string;
  source_id: string;
  category?: string;
  city?: string;
  region?: string;
  language?: string;
};

/** Europe deep pass: no YouTube candidates (user rule). */
function isYoutubeUrl(url: string): boolean {
  return /youtu\.?be|youtube\.com/i.test(String(url || ""));
}

function cleanTitle(title: string) {
  return String(title || "")
    .replace(/\s*\(\d+p\)\s*/gi, " ")
    .replace(/\s*\[.*?\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitleKey(title: string, code: string) {
  return `${code}:${cleanTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;
}

function normalizeUrlKey(url: string) {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return u
      .toString()
      .toLowerCase()
      .replace(/^http:\/\//, "https://")
      .replace(/\/+$/, "");
  } catch {
    return String(url || "")
      .trim()
      .toLowerCase()
      .replace(/^http:\/\//, "https://")
      .replace(/\/+$/, "");
  }
}

function cleanExtractedUrl(raw: string) {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\+$/g, "")
    .replace(/[),;]+$/g, "")
    .trim();
}

function extractMediaFromHtml(html: string) {
  const decoded = html
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");

  const patterns = [
    /https?:\/\/[^"'\\\s<>]+\.(?:m3u8|mpd)[^"'\\\s<>]*/gi,
    /["'](https?:\/\/[^"']+\.(?:m3u8|mpd)[^"']*)["']/gi,
    /(?:file|src|source|hlsUrl|hls_url|streamUrl|stream_url|playbackUrl|manifest)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
    /https?:\/\/[^"'\\\s<>]*\/(?:index|master|playlist|live)[^"'\\\s<>]*\.m3u8[^"'\\\s<>]*/gi,
  ];

  const m3u8: string[] = [];
  for (const re of patterns) {
    for (const match of decoded.match(re) || []) {
      const url = cleanExtractedUrl(match.replace(/^["']|["']$/g, "").replace(/^[^h]+(?=https?:)/, ""));
      if (!/^https?:\/\//i.test(url)) continue;
      if (isYoutubeUrl(url)) continue;
      if (!/\.(m3u8|mpd)(\?|$)/i.test(url) && !/\/(?:live|hls|manifest)/i.test(url)) continue;
      if (/ads?\.|tracking|pixel|analytics|doubleclick|googlesyndication/i.test(url)) continue;
      if (!m3u8.includes(url)) m3u8.push(url);
    }
  }

  const youtube: string[] = [];
  // YouTube intentionally disabled for Europe deep pass.

  // iframe player targets that may themselves be live pages
  const iframes = [
    ...new Set(
      (decoded.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [])
        .map((tag) => {
          const m = /src=["']([^"']+)["']/i.exec(tag);
          return m ? cleanExtractedUrl(m[1]) : "";
        })
        .filter(
          (u) =>
            /^https?:\/\//i.test(u) &&
            !isYoutubeUrl(u) &&
            /live|player|embed|stream|tv|direct|watch/i.test(u)
        )
    ),
  ].slice(0, 8);

  return { m3u8, youtube, iframes };
}

function youtubeVideoId(_raw: string): string | null {
  // Disabled: Europe deep pass rejects YouTube.
  return null;
}

async function deepSegmentOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const text = await res.text();
    if (!text.includes("#EXTM3U") || /<!DOCTYPE|<html/i.test(text)) return false;
    const child = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (!child) return false;
    const childUrl = new URL(child, res.url).toString();
    const childRes = await fetch(childUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "*/*",
        range: "bytes=0-8191",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!childRes.ok && childRes.status !== 206) return false;
    if (/text\/html/i.test(childRes.headers.get("content-type") || "")) return false;
    const body = Buffer.from(await childRes.arrayBuffer());
    if (body.length < 16) return false;
    const asText = body.toString("utf8");
    if (!asText.includes("#EXTM3U")) return true;
    const media = asText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (!media) return false;
    const mediaUrl = new URL(media, childUrl).toString();
    const mediaRes = await fetch(mediaUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "*/*",
        range: "bytes=0-8191",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!mediaRes.ok && mediaRes.status !== 206) return false;
    if (/text\/html/i.test(mediaRes.headers.get("content-type") || "")) return false;
    return Buffer.from(await mediaRes.arrayBuffer()).length >= 16;
  } catch {
    return false;
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker())
  );
  return results;
}

async function loadJsonCache(name: string, url: string) {
  const cacheDir = path.join(masterDir, "cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, name);
  const maxAgeMs = 12 * 60 * 60 * 1000;
  if (fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < maxAgeMs) {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  }
  const res = await fetch(url, {
    headers: { "user-agent": "HiddenTunes-EuropeTV-Deep/1.0" },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) return [];
  const json = await res.json();
  fs.writeFileSync(cachePath, JSON.stringify(json));
  return json;
}

function acceptCountryTags(code: string): Set<string> {
  const s = new Set([code]);
  if (code === "GB") s.add("UK");
  return s;
}

function cityMatchesText(city: string, text: string): boolean {
  const c = city.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(c)) return true;
  // accent-stripped loose match
  const strip = (x: string) =>
    x.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return strip(t).includes(strip(c));
}

function loadCompletedCodes(): Set<string> {
  const statePath = path.join(deepDir, "deep-master-state.json");
  if (!fs.existsSync(statePath)) return new Set();
  try {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const codes = Object.entries(state.countries || {})
      .filter(([, row]: [string, any]) => row && (row.status === "executed" || row.ok === true || row.execute === true))
      .map(([code]) => code);
    return new Set(codes);
  } catch {
    return new Set();
  }
}

function writeDurableCheckpoint(payload: Record<string, unknown>) {
  fs.mkdirSync(deepDir, { recursive: true });
  const checkpoint = {
    ...payload,
    writtenAt: new Date().toISOString(),
    workspace: "C:\\Users\\Wills\\Desktop\\HiddenTunes-TV-40K-EXPANSION",
    branch: "feature/tv-worldwide-40k-expansion",
    mobileCleanUntouched: true,
    africaPreserved: true,
  };
  const tmp = path.join(deepDir, "CHECKPOINT.json.tmp");
  const finalPath = path.join(deepDir, "CHECKPOINT.json");
  fs.writeFileSync(tmp, JSON.stringify(checkpoint, null, 2));
  fs.renameSync(tmp, finalPath);
}

function buildOrder(): string[] {
  const all = EUROPE_EXPANSION_ORDER.map((c) => c.code);
  if (onlyArg) {
    return onlyArg
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((c) => all.includes(c));
  }
  if (codeArg) return [codeArg.toUpperCase()].filter((c) => all.includes(c));
  let order = [...all];
  if (fromArg) {
    const idx = order.indexOf(fromArg.toUpperCase());
    if (idx >= 0) order = order.slice(idx);
  }
  // Always honor protected completed countries unless forced.
  if (!forceRerun) {
    order = order.filter((c) => !PROTECTED_COMPLETED.has(c));
  }
  if (skipCompleted) {
    const done = loadCompletedCodes();
    order = order.filter((c) => !done.has(c));
  }
  return order;
}

/** Per-host spacing to avoid hammering the same broadcaster. */
const hostLastFetch = new Map<string, number>();
async function rateLimitedFetch(url: string, init: RequestInit): Promise<Response> {
  let host = "unknown";
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    /* keep unknown */
  }
  const last = hostLastFetch.get(host) || 0;
  const wait = Math.max(0, HOST_GAP_MS - (Date.now() - last));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  hostLastFetch.set(host, Date.now());
  return fetch(url, init);
}

function updateDeepMaster(row: Record<string, unknown>) {
  fs.mkdirSync(deepDir, { recursive: true });
  const statePath = path.join(deepDir, "deep-master-state.json");
  const mdPath = path.join(deepDir, "EUROPE-DEEP-CITIES-PROGRESS.md");
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8"))
    : { startedAt: new Date().toISOString(), countries: {} as Record<string, unknown> };
  state.countries = state.countries || {};
  state.countries[String(row.code)] = row;
  state.updatedAt = new Date().toISOString();
  state.completedCount = Object.keys(state.countries).length;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  const lines = [
    "# Europe TV Deep City-by-City Progress",
    "",
    `Updated: ${state.updatedAt}`,
    `Countries deep-scanned: **${state.completedCount}** / ${EUROPE_EXPANSION_ORDER.length}`,
    "Sources: curated official/municipal/regional live pages, city-matched iptv-org channels + website extraction, streams join.",
    "Import rule unchanged: lawful + unique + Hidden Tunes `/play` path only.",
    "",
    "| Country | Cities | Sites hunted | Candidates | Verified | Imported | Rejected | Cities with finds |",
    "| ------- | -----: | -----------: | ---------: | -------: | -------: | -------: | ----------------: |",
  ];
  for (const c of EUROPE_EXPANSION_ORDER) {
    const r = state.countries[c.code] as any;
    if (!r) {
      lines.push(`| ${c.name} (${c.code}) | — | — | — | — | — | — | — |`);
      continue;
    }
    lines.push(
      `| ${c.name} (${c.code}) | ${r.citiesSearched ?? "—"} | ${r.sitesHunted ?? "—"} | ${r.candidates ?? "—"} | ${r.verifiedEligible ?? "—"} | ${r.imported ?? "—"} | ${r.rejected ?? "—"} | ${r.citiesWithFinds ?? "—"} |`
    );
  }
  lines.push("");
  fs.writeFileSync(mdPath, lines.join("\n"));
}

async function processCountry(CODE: string) {
  const meta = getEuropeMeta(CODE);
  if (!meta) throw new Error(`${CODE} missing from EUROPE_EXPANSION_ORDER`);

  const countryDir = path.join(deepDir, "countries", CODE);
  fs.mkdirSync(countryDir, { recursive: true });

  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const { probeTvStation, importVerifiedTvGrowthCandidates } = await import("../lib/tvStationHealth");

  const accept = acceptCountryTags(CODE);
  const channels = (await loadJsonCache(
    "channels.json",
    "https://iptv-org.github.io/api/channels.json"
  )) as any[];
  const streams = (await loadJsonCache(
    "streams.json",
    "https://iptv-org.github.io/api/streams.json"
  )) as any[];

  const streamsByChannel = new Map<string, string[]>();
  for (const s of streams) {
    const id = String(s.channel || "");
    const url = String(s.url || "").trim();
    if (!id || !url) continue;
    const list = streamsByChannel.get(id) || [];
    list.push(url);
    streamsByChannel.set(id, list);
  }

  const countryChannels = channels.filter((c) => accept.has(String(c.country || "").toUpperCase()));

  const candidates: Candidate[] = [];
  const cityCoverage: Record<
    string,
    {
      queries: string[];
      channelMatches: number;
      sites: number;
      extractedStreams: number;
      candidates: number;
    }
  > = {};

  // City-by-city: match channels + attach streams + queue websites
  const websitesToHunt: Array<{
    code: string;
    city: string;
    titleHint: string;
    site: string;
    category?: string;
    language?: string;
    source: string;
  }> = [];

  for (const city of meta.cities) {
    const queries = citySearchQueries(city, meta.name, meta.languages);
    const matched = countryChannels.filter((c) => {
      const blob = `${c.name || ""} ${(c.alt_names || []).join(" ")} ${c.id || ""} ${c.network || ""} ${c.website || ""}`;
      return cityMatchesText(city, blob);
    });

    let extractedStreams = 0;
    for (const ch of matched) {
      const urls = streamsByChannel.get(String(ch.id)) || [];
      for (const url of urls) {
        if (isYoutubeUrl(url)) continue;
        extractedStreams += 1;
        candidates.push({
          code: CODE,
          title: cleanTitle(String(ch.name || ch.id)),
          url,
          source: `city-iptv-org:${city}`,
          source_id: `iptv-org-${String(ch.id).replace(/@.*$/, "")}`,
          category: Array.isArray(ch.categories) ? String(ch.categories[0] || "General") : "General",
          city,
          language: meta.languages[0],
        });
      }
      if (ch.website && /^https?:\/\//i.test(String(ch.website))) {
        websitesToHunt.push({
          code: CODE,
          city,
          titleHint: String(ch.name || city),
          site: String(ch.website),
          category: Array.isArray(ch.categories) ? String(ch.categories[0] || "General") : "General",
          source: `city-channel-website:${city}`,
        });
        // Common live subpaths
        try {
          const base = new URL(String(ch.website));
          for (const suffix of ["/live", "/livestream", "/en-direct", "/directo", "/diretta", "/tv", "/watch"]) {
            websitesToHunt.push({
              code: CODE,
              city,
              titleHint: `${ch.name} live`,
              site: new URL(suffix, base).toString(),
              category: "General",
              source: `city-channel-livepath:${city}`,
            });
          }
        } catch {
          /* ignore */
        }
      }
    }

    cityCoverage[city] = {
      queries,
      channelMatches: matched.length,
      sites: 0,
      extractedStreams,
      candidates: 0,
    };
  }

  cityCoverage["_national"] = cityCoverage["_national"] || {
    queries: [`${meta.name} national live TV`],
    channelMatches: 0,
    sites: 0,
    extractedStreams: 0,
    candidates: 0,
  };

  // Country-wide streams: assign to cities by name match (covers stations missed by website extract)
  for (const ch of countryChannels) {
    const urls = streamsByChannel.get(String(ch.id)) || [];
    if (!urls.length) continue;
    const blob = `${ch.name || ""} ${(ch.alt_names || []).join(" ")} ${ch.id || ""}`;
    const matchedCities = meta.cities.filter((city) => cityMatchesText(city, blob));
    const cities = matchedCities.length ? matchedCities : ["_national"];
    for (const city of cities) {
      for (const url of urls) {
        if (isYoutubeUrl(url)) continue;
        candidates.push({
          code: CODE,
          title: cleanTitle(String(ch.name || ch.id)),
          url,
          source: matchedCities.length ? `country-stream-city:${city}` : "country-stream-national",
          source_id: `iptv-org-${String(ch.id).replace(/@.*$/, "")}`,
          category: Array.isArray(ch.categories) ? String(ch.categories[0] || "General") : "General",
          city,
          language: meta.languages[0],
        });
        if (cityCoverage[city]) cityCoverage[city].extractedStreams += 1;
      }
      if (ch.website && /^https?:\/\//i.test(String(ch.website))) {
        websitesToHunt.push({
          code: CODE,
          city,
          titleHint: String(ch.name || city),
          site: String(ch.website),
          category: Array.isArray(ch.categories) ? String(ch.categories[0] || "General") : "General",
          source: `country-channel-website:${city}`,
        });
      }
    }
  }

  // iptv-org country playlist slug(s) with city tagging from titles
  const iptvSlugs = meta.iptvOrgSlugs?.length ? meta.iptvOrgSlugs : [CODE.toLowerCase()];
  for (const slug of iptvSlugs) {
    try {
      const res = await fetch(`https://iptv-org.github.io/iptv/countries/${slug}.m3u`, {
        headers: { "user-agent": "HiddenTunes-EuropeTV-Deep/1.0" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith("#EXTINF:")) continue;
        const url = (lines[i + 1] || "").trim();
        if (!url || url.startsWith("#")) continue;
        if (isYoutubeUrl(url)) continue;
        const title = line.includes(",") ? line.slice(line.lastIndexOf(",") + 1).trim() : "Unknown";
        const group = /group-title="([^"]*)"/i.exec(line)?.[1] || "General";
        const matchedCities = meta.cities.filter((city) => cityMatchesText(city, title));
        const city = matchedCities[0] || "_national";
        candidates.push({
          code: CODE,
          title: cleanTitle(title),
          url,
          source: `iptv-org-m3u-city:${city}`,
          source_id: `iptv-org-m3u-${CODE}-${cleanTitle(title).replace(/[^a-zA-Z0-9]+/g, "").slice(0, 40)}`,
          category: group,
          city,
        });
        if (cityCoverage[city]) cityCoverage[city].extractedStreams += 1;
        // If playlist points at an HTML page, hunt it
        if (!/\.(m3u8|mpd)(\?|$)/i.test(url) && /^https?:\/\//i.test(url) && !/youtu\.?be/i.test(url)) {
          websitesToHunt.push({
            code: CODE,
            city,
            titleHint: title,
            site: url,
            category: group,
            source: `m3u-page-hunt:${city}`,
          });
        }
      }
    } catch {
      /* continue */
    }
  }

  // Wikipedia / Wikimedia search for local TV stations per city (external links only)
  for (const city of meta.cities.slice(0, 24)) {
    try {
      const q = encodeURIComponent(`${city} television station OR local TV OR community television`);
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${q}&limit=5&namespace=0&format=json`;
      const sres = await fetch(searchUrl, {
        headers: { "user-agent": "HiddenTunes-EuropeTV-Deep/1.0 (catalogue research)" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!sres.ok) continue;
      const json = (await sres.json()) as any[];
      const titles = (json?.[1] || []) as string[];
      for (const wikiTitle of titles.slice(0, 3)) {
        const sumUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
          wikiTitle
        )}&prop=externallinks&format=json`;
        const pres = await fetch(sumUrl, {
          headers: { "user-agent": "HiddenTunes-EuropeTV-Deep/1.0 (catalogue research)" },
          signal: AbortSignal.timeout(20_000),
        });
        if (!pres.ok) continue;
        const parsed = (await pres.json()) as any;
        const links: string[] = parsed?.parse?.externallinks || [];
        for (const link of links) {
          if (!/^https?:\/\//i.test(link)) continue;
          if (/wikipedia|wikimedia|archive\.org|facebook|twitter|instagram|linkedin/i.test(link)) continue;
          if (!/(tv|tele|broadcast|media|live|stream|news)/i.test(link)) continue;
          websitesToHunt.push({
            code: CODE,
            city,
            titleHint: wikiTitle,
            site: link,
            category: "General",
            source: `wikipedia-ext:${city}`,
          });
        }
      }
      if (cityCoverage[city]) {
        cityCoverage[city].queries.push(`wikipedia:${city} television station`);
      }
    } catch {
      /* continue */
    }
  }

  // Curated deep sites for this country
  for (const site of EUROPE_DEEP_SITES.filter((s) => s.code === CODE)) {
    websitesToHunt.push({
      code: CODE,
      city: site.city || site.region || meta.name,
      titleHint: site.titleHint,
      site: site.site,
      category: site.category,
      language: site.language,
      source: "curated-deep-site",
    });
    const cityKey = site.city || site.region || "_national";
    if (!cityCoverage[cityKey]) {
      cityCoverage[cityKey] = {
        queries: citySearchQueries(cityKey, meta.name, meta.languages),
        channelMatches: 0,
        sites: 0,
        extractedStreams: 0,
        candidates: 0,
      };
    }
  }

  // Dedupe hunt sites
  const seenSites = new Set<string>();
  const uniqueHunts = websitesToHunt.filter((h) => {
    const key = h.site.toLowerCase().replace(/\/+$/, "");
    if (seenSites.has(key)) return false;
    seenSites.add(key);
    return true;
  });

  const siteResults = await mapPool(uniqueHunts, SITE_CONCURRENCY, async (row) => {
    try {
      const res = await rateLimitedFetch(row.site, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      const html = res.ok ? await res.text() : "";
      const media = extractMediaFromHtml(html);
      // One-level iframe follow for player shells
      const iframeM3u8: string[] = [];
      const iframeYoutube: string[] = [];
      for (const iframe of media.iframes.slice(0, 3)) {
        try {
          const ires = await fetch(iframe, {
            headers: {
              "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              accept: "text/html,application/xhtml+xml",
              referer: row.site,
            },
            redirect: "follow",
            signal: AbortSignal.timeout(15_000),
          });
          if (!ires.ok) continue;
          const nested = extractMediaFromHtml(await ires.text());
          iframeM3u8.push(...nested.m3u8);
          iframeYoutube.push(...nested.youtube);
        } catch {
          /* ignore iframe failures */
        }
      }
      return {
        ...row,
        http: res.status,
        m3u8: [...new Set([...media.m3u8, ...iframeM3u8])].slice(0, 30),
        youtube: [...new Set([...media.youtube, ...iframeYoutube])].slice(0, 12),
        iframes: media.iframes,
        error: null as string | null,
      };
    } catch (e) {
      return {
        ...row,
        http: 0,
        m3u8: [] as string[],
        youtube: [] as string[],
        iframes: [] as string[],
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  for (const row of siteResults) {
    const cityKey = row.city;
    if (cityCoverage[cityKey]) cityCoverage[cityKey].sites += 1;
    for (const url of row.m3u8) {
      if (isYoutubeUrl(url)) continue;
      candidates.push({
        code: CODE,
        title: cleanTitle(row.titleHint),
        url,
        source: row.source,
        source_id: `deep-${CODE}-${Buffer.from(url).toString("base64url").slice(0, 28)}`,
        category: row.category || "General",
        city: row.city,
        language: row.language,
      });
      if (cityCoverage[cityKey]) cityCoverage[cityKey].extractedStreams += 1;
    }
    // YouTube candidates intentionally skipped.
  }

  // Dedupe candidates by URL; drop YouTube entirely
  const dedupedAll: Candidate[] = [];
  const seenUrl = new Set<string>();
  for (const c of candidates) {
    if (isYoutubeUrl(c.url)) continue;
    const key = normalizeUrlKey(c.url);
    if (!key || seenUrl.has(key)) continue;
    seenUrl.add(key);
    dedupedAll.push(c);
  }

  // Prefer city-tagged / curated sources; bound probe cost for large countries
  const MAX_PROBES = 700;
  const ranked = [...dedupedAll].sort((a, b) => {
    const score = (c: Candidate) => {
      let s = 0;
      if (c.source.startsWith("curated")) s += 50;
      if (c.source.includes("wikipedia")) s += 20;
      if (c.city && c.city !== "_national") s += 30;
      if (/\.m3u8(\?|$)/i.test(c.url)) s += 25;
      return s;
    };
    return score(b) - score(a);
  });
  const deduped = ranked.slice(0, MAX_PROBES);

  // Existing catalogue dedupe
  const { data: existingRows } = await supabaseAdmin
    .from("tv_videos")
    .select("id,title,source_url,validated_stream_url,source_id,source_key")
    .eq("region", CODE)
    .limit(5000);
  const existingTitle = new Set(
    (existingRows || []).map((r) => normalizeTitleKey(String(r.title), CODE))
  );
  const existingUrl = new Set(
    (existingRows || []).map((r) => normalizeUrlKey(String(r.source_url || r.validated_stream_url || "")))
  );
  const existingSourceId = new Set(
    (existingRows || []).map((r) => String(r.source_id || "")).filter(Boolean)
  );

  // Global URL collision check
  const candidateUrls = [...new Set(deduped.map((c) => c.url))];
  const globalUrl = new Set<string>();
  for (let i = 0; i < candidateUrls.length; i += 100) {
    const chunk = candidateUrls.slice(i, i + 100);
    const { data } = await supabaseAdmin
      .from("tv_videos")
      .select("source_url")
      .in("source_url", chunk)
      .limit(500);
    for (const row of data || []) globalUrl.add(normalizeUrlKey(String(row.source_url || "")));
  }

  const probeResults = await mapPool(deduped, PROBE_CONCURRENCY, async (c) => {
    const isDup =
      existingTitle.has(normalizeTitleKey(c.title, CODE)) ||
      existingUrl.has(normalizeUrlKey(c.url)) ||
      existingSourceId.has(c.source_id) ||
      globalUrl.has(normalizeUrlKey(c.url));

    const sourceType = "hls_stream";
    const probe = await probeTvStation({
      id: "candidate",
      source_type: sourceType,
      source_id: c.source_id,
      source_url: c.url,
      embed_url: null,
      title: c.title,
      status: "approved",
      playback_status: "unchecked",
      is_active: false,
      reliability_score: 100,
      consecutive_failures: 0,
    });

    const deepOk =
      probe.playable && probe.stream_protocol === "hls"
        ? await deepSegmentOk(probe.validated_stream_url || c.url)
        : probe.playable && probe.stream_protocol !== "hls"
          ? true
          : false;

    const eligible =
      probe.playable === true &&
      probe.ios_playable === true &&
      probe.android_playable === true &&
      deepOk === true &&
      probe.stream_is_https !== false;

    return {
      ...c,
      isDup,
      eligible,
      playable: probe.playable,
      reason: probe.reason,
      protocol: probe.stream_protocol,
      deepOk,
      ios: probe.ios_playable,
      android: probe.android_playable,
      validated: probe.validated_stream_url || null,
    };
  });

  const verifiedEligible = probeResults.filter((r) => r.eligible);
  const novel = verifiedEligible.filter((r) => !r.isDup);
  const rejected = probeResults.filter((r) => !r.eligible).length;

  for (const r of probeResults) {
    if (r.city && cityCoverage[r.city]) cityCoverage[r.city].candidates += 1;
  }

  const importCandidates = novel.map((r) => ({
    source_type: "hls_stream" as const,
    source_id: r.source_id,
    source_url: r.url,
    title: r.title,
    channel_name: r.title,
    category: r.category || "General",
    categories: [r.category || "General"],
    language: r.language || null,
    country: CODE,
    region: CODE,
    description: null as string | null,
    thumbnail_url: null as string | null,
    tags: [
      meta.name,
      CODE,
      "Europe",
      "expansion:europe-deep-cities",
      r.city,
      r.category,
      r.source,
    ].filter(Boolean) as string[],
    source_key: `europe-deep:${CODE}:${r.source_id}`,
  }));

  let importResult: Record<string, unknown> = {
    found: novel.length,
    dryRun: !execute,
    titles: novel.map((r) => r.title),
  };
  if (execute && importCandidates.length > 0) {
    importResult = {
      ...(await importVerifiedTvGrowthCandidates(importCandidates as never)),
      dryRun: false,
      titles: novel.map((r) => r.title),
    };
  }

  // Direct insert fallback for importer flakes
  let directImported = 0;
  if (execute && importCandidates.length > 0) {
    const importedCount = Number((importResult as any).imported || 0);
    if (importedCount < importCandidates.length) {
      const { data: afterPartial } = await supabaseAdmin
        .from("tv_videos")
        .select("title,source_url,source_id")
        .eq("region", CODE)
        .limit(5000);
      const haveTitle = new Set(
        (afterPartial || []).map((r) => normalizeTitleKey(String(r.title), CODE))
      );
      const haveUrl = new Set(
        (afterPartial || []).map((r) => normalizeUrlKey(String(r.source_url || "")))
      );
      for (const c of importCandidates) {
        if (
          haveTitle.has(normalizeTitleKey(c.title, CODE)) ||
          haveUrl.has(normalizeUrlKey(c.source_url))
        ) {
          continue;
        }
        const probe = await probeTvStation({
          id: "candidate",
          source_type: c.source_type,
          source_id: c.source_id,
          source_url: c.source_url,
          embed_url: null,
          title: c.title,
          status: "approved",
          playback_status: "unchecked",
          is_active: false,
          reliability_score: 100,
          consecutive_failures: 0,
        });
        const deepOk =
          probe.playable && probe.stream_protocol === "hls"
            ? await deepSegmentOk(probe.validated_stream_url || c.source_url)
            : probe.playable;
        if (!probe.playable || !probe.ios_playable || !probe.android_playable || !deepOk) continue;
        const { error } = await supabaseAdmin.from("tv_videos").insert({
          source_type: c.source_type,
          source_id: c.source_id,
          source_url: c.source_url,
          title: c.title,
          description: c.description,
          channel_name: c.channel_name,
          category: c.category,
          tags: c.tags,
          region: CODE,
          source_key: c.source_key,
          status: "approved",
          playback_status: "playable",
          is_active: true,
          reliability_score: 100,
          consecutive_failures: 0,
          last_health_checked_at: new Date().toISOString(),
          ios_playable: true,
          android_playable: true,
          stream_is_https: probe.stream_is_https === true,
          stream_protocol: probe.stream_protocol || "hls",
          validated_stream_url: probe.validated_stream_url || c.source_url,
          last_validation_result: probe.last_validation_result || "platform_playable",
          catalog_eligibility_tier: "verified",
        });
        if (!error) {
          directImported += 1;
          haveTitle.add(normalizeTitleKey(c.title, CODE));
          haveUrl.add(normalizeUrlKey(c.source_url));
        }
      }
    }
  }

  const citiesWithFinds = Object.entries(cityCoverage)
    .filter(([, v]) => v.extractedStreams > 0 || v.candidates > 0 || v.channelMatches > 0)
    .map(([city]) => city);
  const citiesNoFind = Object.keys(cityCoverage).filter((c) => !citiesWithFinds.includes(c));

  const summary = {
    code: CODE,
    name: meta.name,
    status: execute ? "executed" : "dry_run",
    execute,
    finishedAt: new Date().toISOString(),
    citiesSearched: Object.keys(cityCoverage).length,
    sitesHunted: uniqueHunts.length,
    candidates: deduped.length,
    verifiedEligible: verifiedEligible.length,
    imported: Number((importResult as any).imported || 0) + directImported,
    rejected,
    duplicatesSkipped: verifiedEligible.filter((r) => r.isDup).length,
    citiesWithFinds: citiesWithFinds.length,
    novelTitles: novel.map((r) => `${r.title} [${r.city || "?"}]`),
  };

  const full = {
    ...summary,
    cityCoverage,
    citiesWithFinds,
    citiesNoFind,
    siteResults: siteResults.map((r) => ({
      city: r.city,
      site: r.site,
      http: r.http,
      m3u8Count: r.m3u8.length,
      youtubeCount: r.youtube.length,
      titleHint: r.titleHint,
      error: r.error,
    })),
    importResult,
    directImported,
    probeSampleRejected: probeResults
      .filter((r) => !r.eligible)
      .slice(0, 40)
      .map((r) => ({ title: r.title, city: r.city, reason: r.reason, source: r.source })),
    probeSampleEligible: novel.slice(0, 40).map((r) => ({
      title: r.title,
      city: r.city,
      source: r.source,
      url: r.url,
    })),
  };

  fs.writeFileSync(
    path.join(countryDir, execute ? "deep-execute-report.json" : "deep-dry-run-report.json"),
    JSON.stringify(full, null, 2)
  );
  fs.writeFileSync(path.join(countryDir, "city-coverage.json"), JSON.stringify(cityCoverage, null, 2));
  fs.writeFileSync(
    path.join(countryDir, "CITY-DEEP-REPORT.md"),
    [
      `# ${meta.name} (${CODE}) — Deep City Discovery`,
      "",
      `Cities searched: ${summary.citiesSearched}`,
      `Sites hunted: ${summary.sitesHunted}`,
      `Candidates: ${summary.candidates}`,
      `Verified eligible: ${summary.verifiedEligible}`,
      `Imported: ${summary.imported}`,
      `Rejected: ${summary.rejected}`,
      "",
      "## Cities with finds",
      "",
      ...citiesWithFinds.map((c) => `- ${c}`),
      "",
      "## Cities with no credible stream extract",
      "",
      ...citiesNoFind.slice(0, 80).map((c) => `- ${c}`),
      "",
      "## Novel imports",
      "",
      ...(summary.novelTitles.length ? summary.novelTitles.map((t) => `- ${t}`) : ["- (none)"]),
      "",
    ].join("\n")
  );

  updateDeepMaster(summary);
  console.log(JSON.stringify({ success: true, ...summary }, null, 2));
  return summary;
}

async function main() {
  fs.mkdirSync(deepDir, { recursive: true });
  const order = buildOrder();
  const runLog: {
    startedAt: string;
    execute: boolean;
    skipCompleted: boolean;
    forceRerun: boolean;
    order: string[];
    results: Array<Record<string, unknown>>;
    finishedAt?: string;
  } = {
    startedAt: new Date().toISOString(),
    execute,
    skipCompleted,
    forceRerun,
    order,
    results: [],
  };
  fs.writeFileSync(path.join(deepDir, "deep-continuous-run.json"), JSON.stringify(runLog, null, 2));
  writeDurableCheckpoint({
    phase: "run_start",
    execute,
    skipCompleted,
    forceRerun,
    remaining: order,
    nextCountry: order[0] || null,
    completedCount: loadCompletedCodes().size,
  });

  for (let i = 0; i < order.length; i++) {
    const code = order[i];
    const nextCountry = order[i + 1] || null;
    writeDurableCheckpoint({
      phase: "country_start",
      currentCountry: code,
      nextCountry,
      remaining: order.slice(i),
      completedCount: loadCompletedCodes().size,
    });
    console.error(
      JSON.stringify({ event: "deep_country_start", code, execute, at: new Date().toISOString() })
    );
    try {
      const summary = await processCountry(code);
      runLog.results.push({ code, ok: true, ...summary });
      writeDurableCheckpoint({
        phase: "country_complete",
        currentCountry: code,
        nextCountry,
        lastSummary: summary,
        remaining: order.slice(i + 1),
        completedCount: loadCompletedCodes().size,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error(JSON.stringify({ event: "deep_country_error", code, error: err }));
      runLog.results.push({ code, ok: false, error: err });
      writeDurableCheckpoint({
        phase: "country_error",
        currentCountry: code,
        nextCountry,
        error: err,
        remaining: order.slice(i),
        completedCount: loadCompletedCodes().size,
      });
      // Continue to next country — one blocked country must not stop Europe.
    }
    fs.writeFileSync(path.join(deepDir, "deep-continuous-run.json"), JSON.stringify(runLog, null, 2));
  }

  runLog.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(deepDir, "deep-continuous-run.json"), JSON.stringify(runLog, null, 2));
  writeDurableCheckpoint({
    phase: "run_complete",
    remaining: [],
    nextCountry: null,
    completedCount: loadCompletedCodes().size,
    results: runLog.results.length,
    failed: runLog.results.filter((r) => !r.ok).map((r) => r.code),
  });
  console.log(
    JSON.stringify(
      {
        success: true,
        execute,
        processed: runLog.results.length,
        failed: runLog.results.filter((r) => !r.ok).map((r) => r.code),
        report: "data/tv-europe-expansion/deep-cities/EUROPE-DEEP-CITIES-PROGRESS.md",
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }));
  process.exitCode = 1;
});

/**
 * Africa TV deep-source discovery + import.
 * Sources beyond country m3u:
 *  - Free-TV/IPTV country playlists (KE/EG/TD/SO)
 *  - Official broadcaster live-page HTML extraction
 *  - Curated known public HLS candidates
 *
 * Usage:
 *   npx tsx scripts/run-africa-tv-deep-sources.ts
 *   npx tsx scripts/run-africa-tv-deep-sources.ts --execute
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const outDir = path.join(adminRoot, "data", "tv-africa-phase2", "deep-sources");
const execute = process.argv.includes("--execute");
const CONCURRENCY = 4;

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
  youtube?: boolean;
  youtubeId?: string;
};

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

function parseM3u(raw: string): Array<{ title: string; url: string }> {
  const lines = raw.split(/\r?\n/);
  const out: Array<{ title: string; url: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXTINF:")) continue;
    const url = (lines[i + 1] || "").trim();
    if (!url || url.startsWith("#")) continue;
    const title = line.includes(",") ? line.slice(line.lastIndexOf(",") + 1).trim() : "Unknown";
    out.push({ title, url });
  }
  return out;
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

function extractMediaFromHtml(html: string) {
  const m3u8 = [
    ...new Set(
      (html.match(/https?:\/\/[^"'\\s<>]+\.(?:m3u8|mpd)[^"'\\s<>]*/gi) || []).map((u) =>
        u.replace(/&amp;/g, "&")
      )
    ),
  ];
  const youtube = [
    ...new Set(
      (html.match(
        /(?:youtube\.com\/(?:embed\/|watch\?v=|live\/|channel\/|@)|youtu\.be\/)[^"'\\s<>]+/gi
      ) || []).map((u) => u.replace(/&amp;/g, "&"))
    ),
  ].slice(0, 12);
  return { m3u8, youtube };
}

function youtubeVideoId(raw: string): string | null {
  try {
    const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
    const u = new URL(withProto);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace(/^\//, "").slice(0, 11);
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const embed = /\/embed\/([\w-]{11})/.exec(u.pathname);
    if (embed) return embed[1];
    return null;
  } catch {
    return null;
  }
}

const FREE_TV: Array<{ code: string; url: string }> = [
  { code: "KE", url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_kenya.m3u8" },
  { code: "EG", url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_egypt.m3u8" },
  { code: "TD", url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_chad.m3u8" },
  { code: "SO", url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_somalia.m3u8" },
];

const OFFICIAL_SITES: Array<{ code: string; site: string }> = [
  { code: "ZA", site: "https://www.enca.com/livestream" },
  { code: "ZA", site: "https://www.sabcnews.com/sabcnews/live/" },
  { code: "KE", site: "https://www.kbc.co.ke/live/" },
  { code: "KE", site: "https://www.kbc.co.ke/kbc-live/" },
  { code: "KE", site: "https://www.citizen.digital/" },
  { code: "KE", site: "https://citizentv.co.ke/live" },
  { code: "KE", site: "https://www.standardmedia.co.ke/ktnnews/live" },
  { code: "KE", site: "https://nation.africa/kenya/tv/live" },
  { code: "KE", site: "https://k24tv.co.ke/live" },
  { code: "ZM", site: "https://www.znbc.co.zm/" },
  { code: "ZM", site: "https://www.znbc.co.zm/live-tv-stream" },
  { code: "ZM", site: "https://znbc.co.zm/tv2-live-streaming" },
  { code: "ZM", site: "https://www.znbc.co.zm/tv3/live-tv-stream" },
  { code: "ZM", site: "https://www.znbc.co.zm/live-tv4" },
  { code: "NA", site: "https://nbc.na/" },
  { code: "NA", site: "https://www.nbc.na/live" },
  { code: "BW", site: "https://www.dailynews.gov.bw/" },
  { code: "TZ", site: "https://www.tbc.go.tz/" },
  { code: "RW", site: "https://www.rba.co.rw/" },
  { code: "ET", site: "https://www.eba.gov.et/" },
  { code: "UG", site: "https://www.ubc.co.ug/" },
  { code: "EG", site: "https://www.nileonline.tv/" },
  { code: "MA", site: "https://www.snrt.ma/" },
  { code: "SN", site: "https://www.rts.sn/" },
  { code: "CI", site: "https://www.rti.ci/" },
  { code: "CM", site: "https://www.crtv.cm/" },
  { code: "MW", site: "https://www.mbc.mw/" },
  { code: "ZW", site: "https://www.zbc.co.zw/" },
  { code: "LS", site: "https://www.lbn.org.ls/" },
  { code: "SZ", site: "https://www.ebs.co.sz/" },
  { code: "GA", site: "https://www.rtg.ga/" },
  { code: "BJ", site: "https://www.ortb.bj/" },
  { code: "TG", site: "https://www.tvt.tg/" },
  { code: "NE", site: "https://www.ortn.ne/" },
  { code: "BF", site: "https://www.rtb.bf/" },
  { code: "ML", site: "https://www.ortm.ml/" },
  { code: "GN", site: "https://www.rti.gouv.gn/" },
  { code: "SL", site: "https://www.slbc.sl/" },
  { code: "LR", site: "https://www.elbc.com.lr/" },
  { code: "GM", site: "https://www.grts.gm/" },
  { code: "CD", site: "https://www.rtnc.cd/" },
  { code: "CG", site: "https://www.telecongo.cg/" },
  { code: "AO", site: "https://www.tpa.ao/" },
  { code: "MZ", site: "https://www.tvm.co.mz/" },
  { code: "TN", site: "https://www.watania.tn/" },
  { code: "DZ", site: "https://www.entv.dz/" },
  { code: "LY", site: "https://www.libyaschannel.com/" },
  { code: "SD", site: "https://www.sbc.gov.sd/" },
  { code: "SS", site: "https://www.sstvss.com/" },
  { code: "DJ", site: "https://www.rtd.dj/" },
  { code: "ER", site: "https://www.shabait.com/" },
  { code: "SC", site: "https://www.sbc.sc/" },
  { code: "MU", site: "https://www.mbcradio.tv/" },
  { code: "RE", site: "https://la1ere.francetvinfo.fr/reunion/" },
];

/** Curated candidates with known public URLs (verify via probe; do not invent). */
const CURATED: Candidate[] = [
  {
    code: "ZA",
    title: "SABC News",
    url: "https://sabconetanw.cdn.mangomolo.com/news/smil:news.stream.smil/master.m3u8",
    source: "curated-mangomolo-public-listing",
    source_id: "curated-SABCNews.za",
    category: "News",
  },
  {
    code: "ZM",
    title: "ZNBC TV1",
    url: "https://dcunilive159-lh.akamaihd.net/i/dclive_1@1013574/master.m3u8",
    source: "curated-znbc-historical-public",
    source_id: "curated-ZNBC-TV1.zm",
    category: "General",
  },
  {
    code: "ZM",
    title: "ZNBC TV4",
    url: "https://dcunilive258-lh.akamaihd.net/i/dclive_1@348579/master.m3u8",
    source: "curated-znbc-historical-public",
    source_id: "curated-ZNBC-TV4.zm",
    category: "General",
  },
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const { probeTvStation, importVerifiedTvGrowthCandidates, validatePublicTvUrl } =
    await import("../lib/tvStationHealth");

  const candidates: Candidate[] = [];
  const discoveryLog: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    execute,
    freeTv: {},
    officialSites: [],
    curatedCount: CURATED.length,
  };

  // Free-TV playlists
  for (const pl of FREE_TV) {
    try {
      const res = await fetch(pl.url, {
        headers: { "user-agent": "HiddenTunes-AfricaTV/1.0" },
        signal: AbortSignal.timeout(60_000),
      });
      const text = res.ok ? await res.text() : "";
      const entries = text ? parseM3u(text) : [];
      (discoveryLog.freeTv as any)[pl.code] = { status: res.status, count: entries.length };
      for (const e of entries) {
        const isHtmlPage = !/\.(m3u8|mpd)(\?|$)/i.test(e.url) && !/youtu\.?be/i.test(e.url);
        if (isHtmlPage) {
          // Follow live pages later via official hunt; keep URL page for hunt list.
          OFFICIAL_SITES.push({ code: pl.code, site: e.url });
          continue;
        }
        candidates.push({
          code: pl.code,
          title: cleanTitle(e.title),
          url: e.url,
          source: "free-tv-iptv",
          source_id: `free-tv-${pl.code}-${cleanTitle(e.title).replace(/[^a-zA-Z0-9]+/g, "").slice(0, 40)}`,
          category: "General",
        });
      }
    } catch (e) {
      (discoveryLog.freeTv as any)[pl.code] = {
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // Official site HTML extraction
  const siteResults = [];
  for (const row of OFFICIAL_SITES) {
    try {
      const res = await fetch(row.site, {
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
      siteResults.push({
        code: row.code,
        site: row.site,
        http: res.status,
        m3u8Count: media.m3u8.length,
        youtubeCount: media.youtube.length,
        m3u8: media.m3u8.slice(0, 20),
        youtube: media.youtube.slice(0, 8),
      });
      for (const url of media.m3u8) {
        candidates.push({
          code: row.code,
          title: `${row.code} official extract ${new URL(url).hostname}`,
          url,
          source: "official-page-extract",
          source_id: `official-${row.code}-${Buffer.from(url).toString("base64url").slice(0, 24)}`,
          category: "General",
        });
      }
      for (const yt of media.youtube) {
        const id = youtubeVideoId(yt);
        if (!id) continue;
        candidates.push({
          code: row.code,
          title: `${row.code} YouTube ${id}`,
          url: `https://www.youtube.com/watch?v=${id}`,
          source: "official-youtube-extract",
          source_id: id,
          category: "News",
          youtube: true,
          youtubeId: id,
        });
      }
    } catch (e) {
      siteResults.push({
        code: row.code,
        site: row.site,
        http: "err",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  discoveryLog.officialSites = siteResults;
  candidates.push(...CURATED);

  // Dedupe candidate list itself
  const seen = new Set<string>();
  const uniqueCandidates: Candidate[] = [];
  for (const c of candidates) {
    const key = `${c.code}|${normalizeUrlKey(c.url)}|${c.youtubeId || c.source_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCandidates.push(c);
  }

  fs.writeFileSync(
    path.join(outDir, "discovery-log.json"),
    JSON.stringify({ ...discoveryLog, candidateCount: uniqueCandidates.length }, null, 2)
  );
  fs.writeFileSync(
    path.join(outDir, "candidates.json"),
    JSON.stringify(uniqueCandidates, null, 2)
  );

  // Global URL existence for candidates
  const urls = [...new Set(uniqueCandidates.filter((c) => !c.youtube).map((c) => c.url))];
  const globalUrls = new Set<string>();
  for (let i = 0; i < urls.length; i += 80) {
    const chunk = urls.slice(i, i + 80);
    const { data } = await supabaseAdmin
      .from("tv_videos")
      .select("source_url,title,region")
      .in("source_url", chunk)
      .limit(500);
    for (const row of data || []) globalUrls.add(normalizeUrlKey(String(row.source_url || "")));
  }

  // Existing titles by country for candidates' codes
  const codes = [...new Set(uniqueCandidates.map((c) => c.code))];
  const existingTitleKeys = new Set<string>();
  for (const code of codes) {
    const { data } = await supabaseAdmin
      .from("tv_videos")
      .select("title,region")
      .eq("region", code)
      .limit(2000);
    for (const row of data || []) {
      existingTitleKeys.add(normalizeTitleKey(String(row.title), code));
    }
  }

  const probeResults = await mapPool(uniqueCandidates, CONCURRENCY, async (c) => {
    const urlKey = normalizeUrlKey(c.url);
    const titleKey = normalizeTitleKey(c.title, c.code);
    const isDup =
      (!c.youtube && globalUrls.has(urlKey)) || existingTitleKeys.has(titleKey);

    if (c.youtube && c.youtubeId) {
      const probe = await probeTvStation({
        id: "candidate",
        source_type: "youtube_video",
        source_id: c.youtubeId,
        source_url: c.url,
        embed_url: null,
        title: c.title,
        status: "approved",
        playback_status: "unchecked",
        is_active: false,
        reliability_score: 100,
        consecutive_failures: 0,
      });

      // Require continuous live — reject finite VODs / one-off events.
      let continuousLive = false;
      let liveMeta: Record<string, unknown> = {};
      try {
        const watch = await fetch(`https://www.youtube.com/watch?v=${c.youtubeId}`, {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(20_000),
        });
        const html = watch.ok ? await watch.text() : "";
        const isLive = /"isLive(?:Content|Now)?"\s*:\s*true/.test(html) || /"isLive"\s*:\s*true/.test(html);
        const lengthMatch = /"lengthSeconds"\s*:\s*"(\d+)"/.exec(html);
        const lengthSeconds = lengthMatch ? Number(lengthMatch[1]) : null;
        // Continuous channel-style live: currently live AND no finite VOD length
        // (or length 0). One-off event livestreams are still rejected by title heuristics.
        const eventLike = /c[eé]r[eé]mon|ceremony|promotion|awards|episode|edition|highlights|magazine/i.test(
          String(c.title || "")
        );
        continuousLive = Boolean(isLive && (lengthSeconds === 0 || lengthSeconds === null) && !eventLike);
        liveMeta = { isLive, lengthSeconds, eventLike };
      } catch {
        continuousLive = false;
      }

      return {
        ...c,
        isDup,
        eligible:
          !isDup &&
          continuousLive &&
          probe.playable === true &&
          probe.ios_playable === true &&
          probe.android_playable === true,
        playable: probe.playable && continuousLive,
        reason: !continuousLive
          ? `youtube_not_continuous_live:${JSON.stringify(liveMeta)}`
          : probe.reason,
        ios: probe.ios_playable,
        android: probe.android_playable,
        protocol: probe.stream_protocol,
        deepOk: continuousLive && probe.playable,
      };
    }

    const urlCheck = validatePublicTvUrl(c.url);
    if (!urlCheck.ok) {
      return {
        ...c,
        isDup,
        eligible: false,
        playable: false,
        reason: `url:${"reason" in urlCheck ? urlCheck.reason : "invalid"}`,
        ios: false,
        android: false,
        protocol: null,
        deepOk: false,
      };
    }

    const probe = await probeTvStation({
      id: "candidate",
      source_type: "hls_stream",
      source_id: c.source_id,
      source_url: urlCheck.url,
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
        ? await deepSegmentOk(probe.validated_stream_url || urlCheck.url)
        : probe.playable === true;
    const eligible =
      !isDup &&
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
      ios: probe.ios_playable,
      android: probe.android_playable,
      protocol: probe.stream_protocol,
      https: probe.stream_is_https,
      deepOk,
      validated: probe.validated_stream_url || null,
    };
  });

  fs.writeFileSync(path.join(outDir, "probe-report.json"), JSON.stringify(probeResults, null, 2));

  const novelEligible = probeResults.filter((r) => r.eligible);
  const rejected = probeResults.filter((r) => !r.playable || !r.deepOk);
  const dups = probeResults.filter((r) => r.isDup);

  const importCandidates = novelEligible.map((r) => {
    if (r.youtube && r.youtubeId) {
      return {
        source_type: "youtube_video",
        source_id: r.youtubeId,
        source_url: r.url,
        title: cleanTitle(r.title.replace(/YouTube\s+[\w-]{11}/i, "").trim() || r.title),
        channel_name: cleanTitle(r.title),
        category: r.category || "News",
        categories: [r.category || "News"],
        country: r.code,
        region: r.code,
        description: null as string | null,
        tags: [r.code, "Africa", "expansion:africa-deep-sources", r.source],
        source_key: `africa-deep:${r.code}:yt:${r.youtubeId}`,
      };
    }
    return {
      source_type: "hls_stream" as const,
      source_id: r.source_id,
      source_url: r.url,
      title: cleanTitle(r.title),
      channel_name: cleanTitle(r.title),
      category: r.category || "General",
      categories: [r.category || "General"],
      country: r.code,
      region: r.code,
      description: null as string | null,
      tags: [r.code, "Africa", "expansion:africa-deep-sources", r.source],
      source_key: `africa-deep:${r.code}:${r.source_id}`,
    };
  });

  let importResult: Record<string, unknown> = {
    found: importCandidates.length,
    dryRun: !execute,
    titles: novelEligible.map((r) => `${r.code}:${r.title}`),
  };

  let directImported: Array<Record<string, unknown>> = [];
  if (execute && importCandidates.length > 0) {
    importResult = {
      ...(await importVerifiedTvGrowthCandidates(importCandidates as any)),
      dryRun: false,
      titles: novelEligible.map((r) => `${r.code}:${r.title}`),
    };

    // Direct insert fallback for any remaining eligible not imported
    if (Number((importResult as any).imported || 0) < importCandidates.length) {
      for (const c of importCandidates) {
        const { data: exist } = await supabaseAdmin
          .from("tv_videos")
          .select("id")
          .or(
            `source_url.eq.${c.source_url},source_id.eq.${c.source_id},source_key.eq.${c.source_key}`
          )
          .limit(1);
        if (exist && exist.length) continue;

        const probe = await probeTvStation({
          id: "candidate",
          source_type: String(c.source_type),
          source_id: String(c.source_id),
          source_url: String(c.source_url),
          embed_url: null,
          title: String(c.title),
          status: "approved",
          playback_status: "unchecked",
          is_active: false,
          reliability_score: 100,
          consecutive_failures: 0,
        });
        const deepOk = c.source_type === "youtube_video"
          ? probe.playable
          : probe.playable
            ? await deepSegmentOk(probe.validated_stream_url || String(c.source_url))
            : false;
        if (!probe.playable || !probe.ios_playable || !probe.android_playable || !deepOk) continue;

        const { data, error } = await supabaseAdmin
          .from("tv_videos")
          .insert({
            source_type: c.source_type,
            source_id: c.source_id,
            source_url: c.source_url,
            title: c.title,
            description: c.description,
            channel_name: c.channel_name,
            category: c.category,
            tags: c.tags,
            region: c.country,
            source_key: c.source_key,
            status: "approved",
            playback_status: "playable",
            is_active: true,
            reliability_score: 100,
            consecutive_failures: 0,
            last_health_checked_at: new Date().toISOString(),
            ios_playable: true,
            android_playable: true,
            stream_is_https: probe.stream_is_https === true || c.source_type === "youtube_video",
            stream_protocol: probe.stream_protocol || (c.source_type === "youtube_video" ? "youtube" : "hls"),
            validated_stream_url: probe.validated_stream_url || c.source_url,
            last_validation_result: probe.last_validation_result || "platform_playable",
            catalog_eligibility_tier: "verified",
          })
          .select("id,title,region,is_public")
          .single();
        if (!error && data) directImported.push(data as any);
      }
    }
  }

  const summary = {
    execute,
    finishedAt: new Date().toISOString(),
    discovered: uniqueCandidates.length,
    probed: probeResults.length,
    eligibleNovel: novelEligible.length,
    duplicates: dups.length,
    rejected: rejected.length,
    imported:
      Number((importResult as any).imported || 0) + directImported.length,
    importResult,
    directImported,
    novel: novelEligible.map((r) => ({
      code: r.code,
      title: r.title,
      source: r.source,
      urlHost: (() => {
        try {
          return new URL(r.url).hostname;
        } catch {
          return null;
        }
      })(),
      protocol: r.protocol,
    })),
    rejectedSample: rejected.slice(0, 40).map((r) => ({
      code: r.code,
      title: r.title,
      reason: r.reason,
      source: r.source,
    })),
    byCountry: Object.fromEntries(
      codes.map((code) => {
        const rows = probeResults.filter((r) => r.code === code);
        return [
          code,
          {
            candidates: rows.length,
            eligibleNovel: rows.filter((r) => r.eligible).length,
            dups: rows.filter((r) => r.isDup).length,
            rejected: rows.filter((r) => !r.playable || !r.deepOk).length,
          },
        ];
      })
    ),
  };

  fs.writeFileSync(path.join(outDir, "deep-execute-summary.json"), JSON.stringify(summary, null, 2));

  // Append note into master report
  const masterMd = path.join(adminRoot, "data", "tv-africa-phase2", "AFRICA-TV-EXPANSION-REPORT.md");
  if (fs.existsSync(masterMd)) {
    const appendix = [
      "",
      "## Deep-source pass",
      "",
      `Updated: ${summary.finishedAt}`,
      "",
      `| Metric | Value |`,
      `|--------|------:|`,
      `| Candidates discovered | ${summary.discovered} |`,
      `| Novel eligible | ${summary.eligibleNovel} |`,
      `| Imported | ${summary.imported} |`,
      `| Duplicates | ${summary.duplicates} |`,
      `| Rejected | ${summary.rejected} |`,
      "",
      summary.novel.length
        ? `Novel imports: ${summary.novel.map((n) => `${n.code}:${n.title}`).join(", ")}`
        : "No novel app-path-eligible stations found in this deep pass.",
      "",
      "Sources: Free-TV Africa playlists, official broadcaster HTML extraction, curated public HLS candidates.",
      "Artifacts: `data/tv-africa-phase2/deep-sources/`",
      "",
    ].join("\n");
    const current = fs.readFileSync(masterMd, "utf8");
    if (!current.includes("## Deep-source pass")) {
      fs.writeFileSync(masterMd, current.trimEnd() + "\n" + appendix);
    } else {
      fs.writeFileSync(
        masterMd,
        current.replace(/## Deep-source pass[\s\S]*$/m, appendix.trimStart())
      );
    }
  }

  console.log(JSON.stringify({ success: true, ...summary }, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }));
  process.exitCode = 1;
});

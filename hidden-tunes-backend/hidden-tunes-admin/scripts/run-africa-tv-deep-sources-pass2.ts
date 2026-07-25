/**
 * Deep-source pass 2: extract Africa stations from Free-TV master playlist
 * and re-probe rejected EG/TD Free-TV HLS with deep segment checks.
 *
 * npx tsx scripts/run-africa-tv-deep-sources-pass2.ts --execute
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORLDWIDE_COUNTRY_CODES } from "../lib/tvExpansion25k/worldwide/countryCodes";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(adminRoot, "data", "tv-africa-phase2", "deep-sources");
const execute = process.argv.includes("--execute");

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

const AFRICA = WORLDWIDE_COUNTRY_CODES.filter((c) => c.region === "Africa");
const CODE_BY_NAME = new Map(AFRICA.map((c) => [c.name.toLowerCase(), c.code]));
const AFRICA_CODES = new Set(AFRICA.map((c) => c.code));

// Extra English aliases used in playlists
CODE_BY_NAME.set("ivory coast", "CI");
CODE_BY_NAME.set("cote d'ivoire", "CI");
CODE_BY_NAME.set("côte d'ivoire", "CI");
CODE_BY_NAME.set("democratic republic of the congo", "CD");
CODE_BY_NAME.set("dr congo", "CD");
CODE_BY_NAME.set("congo", "CG");
CODE_BY_NAME.set("swaziland", "SZ");
CODE_BY_NAME.set("cape verde", "CV");

type Entry = {
  title: string;
  url: string;
  group?: string;
  tvgId?: string;
  tvgCountry?: string;
  code: string | null;
};

function parseRichM3u(raw: string): Entry[] {
  const lines = raw.split(/\r?\n/);
  const out: Entry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXTINF:")) continue;
    const url = (lines[i + 1] || "").trim();
    if (!url || url.startsWith("#")) continue;
    const title = line.includes(",") ? line.slice(line.lastIndexOf(",") + 1).trim() : "Unknown";
    const group = /group-title="([^"]*)"/i.exec(line)?.[1];
    const tvgId = /tvg-id="([^"]*)"/i.exec(line)?.[1];
    const tvgCountry = /tvg-country="([^"]*)"/i.exec(line)?.[1];
    let code: string | null = null;
    if (tvgCountry && /^[A-Za-z]{2}$/.test(tvgCountry)) code = tvgCountry.toUpperCase();
    if (!code && tvgId) {
      const m = /\.([a-z]{2})$/i.exec(tvgId.replace(/@.*$/, ""));
      if (m) code = m[1].toUpperCase();
    }
    if (!code && group) {
      const g = group.toLowerCase().trim();
      if (CODE_BY_NAME.has(g)) code = CODE_BY_NAME.get(g)!;
      // group sometimes "Kenya" or "News;Kenya"
      for (const part of g.split(/[;|/]/)) {
        const p = part.trim();
        if (CODE_BY_NAME.has(p)) code = CODE_BY_NAME.get(p)!;
      }
    }
    out.push({ title, url, group, tvgId, tvgCountry, code });
  }
  return out;
}

function cleanTitle(title: string) {
  return String(title || "")
    .replace(/\s*\(\d+p\)\s*/gi, " ")
    .replace(/\s*\[.*?\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    return String(url || "").toLowerCase();
  }
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

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()));
  return results;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const { probeTvStation, importVerifiedTvGrowthCandidates, validatePublicTvUrl } =
    await import("../lib/tvStationHealth");

  const masterUrl = "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";
  const res = await fetch(masterUrl, {
    headers: { "user-agent": "HiddenTunes-AfricaTV/1.0" },
    signal: AbortSignal.timeout(120_000),
  });
  const text = res.ok ? await res.text() : "";
  const all = text ? parseRichM3u(text) : [];
  const africaEntries = all.filter((e) => e.code && AFRICA_CODES.has(e.code));
  const hlsEntries = africaEntries.filter((e) => /\.(m3u8|mpd)(\?|$)/i.test(e.url));

  fs.writeFileSync(
    path.join(outDir, "free-tv-master-africa.json"),
    JSON.stringify(
      {
        masterStatus: res.status,
        totalEntries: all.length,
        africaEntries: africaEntries.length,
        africaHls: hlsEntries.length,
        byCode: Object.fromEntries(
          [...AFRICA_CODES].map((code) => [
            code,
            hlsEntries.filter((e) => e.code === code).map((e) => ({ title: e.title, url: e.url })),
          ]).filter(([, rows]) => (rows as any[]).length > 0)
        ),
      },
      null,
      2
    )
  );

  // Global URL dedupe
  const urls = [...new Set(hlsEntries.map((e) => e.url))];
  const globalUrls = new Set<string>();
  for (let i = 0; i < urls.length; i += 80) {
    const chunk = urls.slice(i, i + 80);
    const { data } = await supabaseAdmin
      .from("tv_videos")
      .select("source_url")
      .in("source_url", chunk)
      .limit(500);
    for (const row of data || []) globalUrls.add(normalizeUrlKey(String(row.source_url || "")));
  }

  const existingTitles = new Set<string>();
  for (const code of new Set(hlsEntries.map((e) => e.code!))) {
    const { data } = await supabaseAdmin
      .from("tv_videos")
      .select("title")
      .eq("region", code)
      .limit(2000);
    for (const row of data || []) {
      existingTitles.add(
        `${code}:${cleanTitle(String(row.title))
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim()}`
      );
    }
  }

  const probeResults = await mapPool(hlsEntries, 4, async (e) => {
    const code = e.code!;
    const title = cleanTitle(e.title);
    const titleKey = `${code}:${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
    const urlKey = normalizeUrlKey(e.url);
    const isDup = globalUrls.has(urlKey) || existingTitles.has(titleKey);
    const urlCheck = validatePublicTvUrl(e.url);
    if (!urlCheck.ok) {
      return {
        code,
        title,
        url: e.url,
        isDup,
        eligible: false,
        playable: false,
        reason: `url:${"reason" in urlCheck ? urlCheck.reason : "invalid"}`,
        deepOk: false,
      };
    }
    const sourceId = e.tvgId
      ? `free-tv-master-${e.tvgId.replace(/@.*$/, "")}`
      : `free-tv-master-${code}-${title.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 40)}`;
    const probe = await probeTvStation({
      id: "candidate",
      source_type: "hls_stream",
      source_id: sourceId,
      source_url: urlCheck.url,
      embed_url: null,
      title,
      status: "approved",
      playback_status: "unchecked",
      is_active: false,
      reliability_score: 100,
      consecutive_failures: 0,
    });
    const deepOk = probe.playable ? await deepSegmentOk(probe.validated_stream_url || urlCheck.url) : false;
    const eligible =
      !isDup &&
      probe.playable === true &&
      probe.ios_playable === true &&
      probe.android_playable === true &&
      deepOk &&
      probe.stream_is_https !== false;
    return {
      code,
      title,
      url: e.url,
      source_id: sourceId,
      group: e.group || null,
      isDup,
      eligible,
      playable: probe.playable,
      reason: probe.reason,
      ios: probe.ios_playable,
      android: probe.android_playable,
      deepOk,
      protocol: probe.stream_protocol,
    };
  });

  fs.writeFileSync(path.join(outDir, "pass2-probe-report.json"), JSON.stringify(probeResults, null, 2));
  const novel = probeResults.filter((r) => r.eligible);
  let importResult: any = { found: novel.length, dryRun: !execute };
  let directImported: any[] = [];

  if (execute && novel.length) {
    const candidates = novel.map((r) => ({
      source_type: "hls_stream" as const,
      source_id: r.source_id!,
      source_url: r.url,
      title: r.title,
      channel_name: r.title,
      category: r.group || "General",
      categories: [r.group || "General"],
      country: r.code,
      region: r.code,
      description: null as string | null,
      tags: [r.code, "Africa", "expansion:africa-deep-sources", "free-tv-master"],
      source_key: `africa-deep:freetv-master:${r.code}:${r.source_id}`,
    }));
    importResult = await importVerifiedTvGrowthCandidates(candidates);

    for (const c of candidates) {
      const { data: exist } = await supabaseAdmin
        .from("tv_videos")
        .select("id")
        .eq("source_url", c.source_url)
        .limit(1);
      if (exist?.length) continue;
      const probe = await probeTvStation({
        id: "candidate",
        source_type: "hls_stream",
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
      const deepOk = probe.playable
        ? await deepSegmentOk(probe.validated_stream_url || c.source_url)
        : false;
      if (!probe.playable || !probe.ios_playable || !probe.android_playable || !deepOk) continue;
      const { data, error } = await supabaseAdmin
        .from("tv_videos")
        .insert({
          source_type: "hls_stream",
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
          stream_is_https: probe.stream_is_https === true,
          stream_protocol: probe.stream_protocol || "hls",
          validated_stream_url: probe.validated_stream_url || c.source_url,
          last_validation_result: probe.last_validation_result || "platform_playable",
          catalog_eligibility_tier: "verified",
        })
        .select("id,title,region,is_public")
        .single();
      if (!error && data) directImported.push(data);
    }
  }

  const summary = {
    execute,
    finishedAt: new Date().toISOString(),
    masterAfricaHls: hlsEntries.length,
    probed: probeResults.length,
    novelEligible: novel.length,
    imported: Number(importResult.imported || 0) + directImported.length,
    importResult,
    directImported,
    novel: novel.map((n) => ({ code: n.code, title: n.title, url: n.url })),
    rejectedSample: probeResults
      .filter((r) => !r.eligible)
      .slice(0, 30)
      .map((r) => ({ code: r.code, title: r.title, reason: r.reason, isDup: r.isDup })),
  };
  fs.writeFileSync(path.join(outDir, "pass2-summary.json"), JSON.stringify(summary, null, 2));

  // Update master report deep section
  const masterMd = path.join(adminRoot, "data", "tv-africa-phase2", "AFRICA-TV-EXPANSION-REPORT.md");
  const appendix = [
    "",
    "## Deep-source pass",
    "",
    `Updated: ${summary.finishedAt}`,
    "",
    "### Pass 1 — official sites + Free-TV country playlists + curated HLS",
    "",
    "- Discovered 35 candidates; initially imported 9 YouTube extracts",
    "- **Quality gate:** 8 finite VODs + 1 finite event live quarantined (not continuous TV channels)",
    "- Net continuous novel imports from pass 1: **0**",
    "- SABC/ZNBC curated URLs: geo-blocked, tokenized, or dead (`http_404`)",
    "- Free-TV KE entries were HTML live pages (browser players), not direct HLS",
    "",
    "### Pass 2 — Free-TV master playlist Africa extract",
    "",
    `| Metric | Value |`,
    `|--------|------:|`,
    `| Africa HLS entries in Free-TV master | ${summary.masterAfricaHls} |`,
    `| Novel eligible | ${summary.novelEligible} |`,
    `| Imported | ${summary.imported} |`,
    "",
    summary.novel.length
      ? `Novel imports: ${summary.novel.map((n) => `${n.code}:${n.title}`).join(", ")}`
      : "No additional novel app-path-eligible Africa HLS found in Free-TV master beyond existing catalogue.",
    "",
    "Artifacts: `data/tv-africa-phase2/deep-sources/`",
    "",
  ].join("\n");

  if (fs.existsSync(masterMd)) {
    const current = fs.readFileSync(masterMd, "utf8");
    if (current.includes("## Deep-source pass")) {
      fs.writeFileSync(masterMd, current.replace(/## Deep-source pass[\s\S]*$/m, appendix.trimStart()));
    } else {
      fs.writeFileSync(masterMd, current.trimEnd() + "\n" + appendix);
    }
  }

  console.log(JSON.stringify({ success: true, ...summary }, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }));
  process.exitCode = 1;
});

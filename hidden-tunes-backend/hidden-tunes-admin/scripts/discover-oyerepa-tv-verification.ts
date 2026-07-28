/**
 * Oyerepa TV discovery + verification via existing TV probe path.
 * Does NOT insert unless a candidate passes probeStreamUrl.
 *
 *   npx tsx scripts/discover-oyerepa-tv-verification.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { probeStreamUrl, classifyStreamUrl } from "@/lib/tvStreamProtocol";

const adminRoot = path.resolve(__dirname, "..");
const RESULT = path.join(adminRoot, "data", "oyerepa-tv-discovery-verification-result.json");
const ADMIN_API = "https://admin.hiddentunes.com";
const USER_AGENT = "HiddenTunes/1.0 oyerepa-tv-discovery";

const HISTORICAL_CANDIDATES = [
  "https://stream.ecable.tv/oyerepa/tracks-v1a1/mono.m3u8",
  "https://stream.ecable.tv/oyerepa/index.m3u8",
  "https://stream.ecable.tv/oyerepa/playlist.m3u8",
  "https://stream.ecable.tv/oyerepatv/index.m3u8",
  "https://cdn.ecable.tv/oyerepa/index.m3u8",
  "https://oyerepa-atunwadigital.streamguys1.com/oyerepatv",
  "https://oyerepa-atunwadigital.streamguys1.com/oyerepa/tv",
  "https://oyerepatv-atunwadigital.streamguys1.com/oyerepatv",
  "https://oyerepa-atunwadigital.streamguys1.com/oyerepa", // FM audio — must reject as TV
];

const OFFICIAL_PAGES = [
  "https://oyerepafmonline.com/",
  "https://oyerepafmonline.com/live/",
  "https://oyerepafmonline.com/live-tv/",
  "https://oyerepafmonline.com/tv/",
  "https://oyerepatv.com/",
  "https://www.oyerepatv.com/",
];

function sanitizeUrl(url: string) {
  try {
    const u = new URL(url);
    // strip obvious signed query params from logs
    for (const key of [...u.searchParams.keys()]) {
      if (/token|sig|signature|exp|expires|auth|key|session/i.test(key)) {
        u.searchParams.set(key, "[redacted]");
      }
    }
    return u.toString();
  } catch {
    return url.slice(0, 200);
  }
}

function extractStreamHints(html: string, baseUrl: string) {
  const found = new Set<string>();
  const patterns = [
    /https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|mpd)(?:\?[^"'\\\s<>]*)?/gi,
    /["']([^"'\\\s]+\.(?:m3u8|mpd)(?:\?[^"'\\\s]*)?)["']/gi,
    /src=["']([^"']+)["']/gi,
    /data-src=["']([^"']+)["']/gi,
    /file\s*:\s*["']([^"']+)["']/gi,
    /source\s*:\s*["']([^"']+)["']/gi,
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const raw = m[1] || m[0];
      try {
        const abs = new URL(raw.replace(/^["']|["']$/g, ""), baseUrl).toString();
        if (/youtube|facebook|fbcdn|blob:|javascript:/i.test(abs)) continue;
        if (/\.(m3u8|mpd)(\?|$)/i.test(abs) || /\/(hls|live|stream|playlist)\b/i.test(abs)) {
          found.add(abs);
        }
        if (/iframe|player|embed|atunwa|streamguys|mux|cloudflare|ecable/i.test(abs)) {
          found.add(abs);
        }
      } catch {
        // ignore
      }
    }
  }
  return [...found];
}

async function fetchText(url: string) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json,*/*" },
    });
    const text = await response.text();
    return {
      url,
      finalUrl: response.url,
      status: response.status,
      contentType: response.headers.get("content-type"),
      text,
      ok: response.ok,
    };
  } catch (error) {
    return {
      url,
      status: 0,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      text: "",
      finalUrl: url,
      contentType: null,
    };
  }
}

async function probeCandidate(url: string) {
  const classification = classifyStreamUrl(url);
  const probe = await probeStreamUrl(url);
  // Extra: if HLS, try to parse variants/segments lightly from the body already fetched by probe
  let playlistSummary: Record<string, unknown> | null = null;
  if (probe.isHlsManifest && probe.playable) {
    try {
      const response = await fetch(probe.finalUrl || url, {
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        redirect: "follow",
      });
      const body = (await response.text()).slice(0, 200_000);
      const isMaster = /#EXT-X-STREAM-INF/i.test(body);
      const isMedia = /#EXTINF/i.test(body);
      const variants = [...body.matchAll(/#EXT-X-STREAM-INF:[^\n]*\n([^\n]+)/gi)].map((m) =>
        m[1].trim(),
      );
      const mediaSeq = body.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/i)?.[1] || null;
      const targetDuration = body.match(/#EXT-X-TARGETDURATION:(\d+)/i)?.[1] || null;
      const segmentLines = body
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .slice(0, 8);
      const segmentResults: Array<Record<string, unknown>> = [];
      for (const seg of segmentLines.slice(0, 3)) {
        try {
          const segUrl = new URL(seg, probe.finalUrl || url).toString();
          const segRes = await fetch(segUrl, {
            headers: { "User-Agent": USER_AGENT, Range: "bytes=0-2047" },
            redirect: "follow",
          });
          const buf = Buffer.from(await segRes.arrayBuffer());
          const looksHtml = /text\/html/i.test(segRes.headers.get("content-type") || "") ||
            /^\s*</.test(buf.toString("utf8"));
          segmentResults.push({
            status: segRes.status,
            contentType: segRes.headers.get("content-type"),
            bytes: buf.length,
            looksHtml,
            ok: segRes.ok && !looksHtml && buf.length > 0,
            sanitized: sanitizeUrl(segUrl),
          });
        } catch (error) {
          segmentResults.push({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      playlistSummary = {
        isMaster,
        isMedia,
        mediaSeq,
        targetDuration,
        variantCount: variants.length,
        variantsSample: variants.slice(0, 5).map(sanitizeUrl),
        segmentResults,
      };
    } catch (error) {
      playlistSummary = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const rejectReasons: string[] = [];
  if (!probe.playable) rejectReasons.push(probe.reason || "not_playable");
  if (/oyerepa-atunwadigital\.streamguys1\.com\/oyerepa$/i.test(url)) {
    rejectReasons.push("audio_only_fm_mount_not_tv");
  }
  if (probe.contentType && /audio\//i.test(probe.contentType) && !probe.isHlsManifest) {
    rejectReasons.push("audio_mime_not_tv");
  }
  if (/youtube|facebook|fb\.watch/i.test(url)) {
    rejectReasons.push("social_media_page_not_direct_stream");
  }

  return {
    url: sanitizeUrl(url),
    classification,
    probe: {
      playable: probe.playable,
      reason: probe.reason,
      protocol: probe.protocol,
      finalUrl: sanitizeUrl(probe.finalUrl || ""),
      contentType: probe.contentType,
      isHlsManifest: probe.isHlsManifest,
      isVideoLike: probe.isVideoLike,
      streamIsHttps: probe.streamIsHttps,
      redirectCount: probe.redirectCount,
    },
    playlistSummary,
    rejected: rejectReasons.length > 0 || !probe.playable,
    rejectReasons: rejectReasons.length ? rejectReasons : !probe.playable ? [probe.reason] : [],
  };
}

async function loadIptvOrg() {
  const channels = await fetchText("https://iptv-org.github.io/api/channels.json");
  const streams = await fetchText("https://iptv-org.github.io/api/streams.json");
  let channel: unknown = null;
  let streamHits: unknown[] = [];
  try {
    const ch = JSON.parse(channels.text) as Array<Record<string, unknown>>;
    channel = ch.find((c) => String(c.id) === "OyerepaTV.gh" || /oyerepa/i.test(String(c.name)));
  } catch {
    // ignore
  }
  try {
    const st = JSON.parse(streams.text) as Array<Record<string, unknown>>;
    streamHits = st.filter(
      (s) =>
        String(s.channel) === "OyerepaTV.gh" ||
        /oyerepa/i.test(JSON.stringify(s)),
    );
  } catch {
    // ignore
  }
  return {
    channel_fetch_status: channels.status,
    streams_fetch_status: streams.status,
    channel,
    streamHits,
  };
}

async function main() {
  loadAdminEnv(adminRoot);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("missing_supabase_credentials");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Production sanity: known Ghana TV station from public API
  const publicGhana = await fetchText(`${ADMIN_API}/api/tv/videos?country=GH&page=1&limit=10&platform=android`);
  let publicGhanaJson: unknown = null;
  try {
    publicGhanaJson = JSON.parse(publicGhana.text);
  } catch {
    publicGhanaJson = null;
  }

  const catalogSearch = await supabase
    .from("tv_videos")
    .select(
      "id,title,channel_name,source_id,source_key,source_url,source_type,status,playback_status,is_active,is_public,reliability_score,quarantined_at,disabled_at,region,tags,validated_stream_url,last_validation_result,last_health_checked_at,last_health_error,ios_playable,android_playable,stream_protocol,stream_is_https",
    )
    .or(
      [
        "title.ilike.%oyerepa%",
        "channel_name.ilike.%oyerepa%",
        "source_id.ilike.%oyerepa%",
        "source_key.ilike.%oyerepa%",
        "source_url.ilike.%oyerepa%",
      ].join(","),
    )
    .limit(50);

  const hope = await supabase
    .from("tv_videos")
    .select("id,title,status,playback_status,is_active,is_public")
    .eq("id", "fe774862-4f55-4f7a-8044-9c45cef2604f")
    .maybeSingle();

  const pageResults = [];
  const discoveredUrls = new Set<string>();
  for (const page of OFFICIAL_PAGES) {
    const fetched = await fetchText(page);
    const hints = fetched.text ? extractStreamHints(fetched.text, fetched.finalUrl || page) : [];
    for (const h of hints) discoveredUrls.add(h);
    // Follow promising iframe/player pages one level
    const follow = hints.filter((h) => /player|embed|iframe|atunwa|html/i.test(h)).slice(0, 5);
    const nestedHints: string[] = [];
    for (const f of follow) {
      if (/\.(m3u8|mpd)(\?|$)/i.test(f)) continue;
      const nested = await fetchText(f);
      const nh = nested.text ? extractStreamHints(nested.text, nested.finalUrl || f) : [];
      nestedHints.push(...nh);
      for (const x of nh) discoveredUrls.add(x);
    }
    pageResults.push({
      page,
      status: fetched.status,
      finalUrl: fetched.finalUrl,
      contentType: fetched.contentType,
      error: (fetched as { error?: string }).error || null,
      hints: hints.map(sanitizeUrl),
      nestedHints: nestedHints.map(sanitizeUrl),
    });
  }

  // Also check Atunwa for TV player pages
  for (const extra of [
    "https://atunwapodcasts.com/player/oyerepatv.html",
    "https://atunwapodcasts.com/player/oyerepa-tv.html",
    "https://atunwadigital.com/clients/oyerepa-radio/",
  ]) {
    const fetched = await fetchText(extra);
    const hints = fetched.text ? extractStreamHints(fetched.text, fetched.finalUrl || extra) : [];
    for (const h of hints) discoveredUrls.add(h);
    pageResults.push({
      page: extra,
      status: fetched.status,
      finalUrl: fetched.finalUrl,
      contentType: fetched.contentType,
      error: (fetched as { error?: string }).error || null,
      hints: hints.map(sanitizeUrl),
      nestedHints: [],
    });
  }

  const iptv = await loadIptvOrg();
  for (const hit of iptv.streamHits as Array<{ url?: string }>) {
    if (hit?.url) discoveredUrls.add(String(hit.url));
  }

  const allCandidates = [
    ...HISTORICAL_CANDIDATES,
    ...[...discoveredUrls].filter((u) => /\.(m3u8|mpd)(\?|$)/i.test(u) || /\/(hls|live|stream)\b/i.test(u)),
  ];
  const uniqueCandidates = [...new Set(allCandidates)];

  const probeResults = [];
  for (const candidate of uniqueCandidates) {
    probeResults.push(await probeCandidate(candidate));
  }

  const viable = probeResults.filter(
    (r) =>
      !r.rejected &&
      r.probe.playable &&
      r.probe.isHlsManifest &&
      r.probe.isVideoLike &&
      !r.rejectReasons.includes("audio_only_fm_mount_not_tv"),
  );

  const publicSearch = await fetchText(
    `${ADMIN_API}/api/tv/videos?q=oyerepa&page=1&limit=10&platform=android`,
  );
  let publicSearchJson: unknown = null;
  try {
    publicSearchJson = JSON.parse(publicSearch.text);
  } catch {
    publicSearchJson = null;
  }

  const report = {
    started_at: new Date().toISOString(),
    workspace: adminRoot,
    supabase_host: new URL(supabaseUrl).host,
    production_api_serves_admin: true,
    owners: {
      catalog_table: "tv_videos",
      catalog_lib: "lib/tvCatalog.ts",
      importer: "lib/tvStationHealth.ts#importVerifiedTvGrowthCandidates + lib/tvExpansion25k/fast/bulkImport.ts",
      verifier: "lib/tvStreamProtocol.ts#probeStreamUrl + lib/tvStationHealth.ts#probeTvStation",
      play_resolver: "app/api/tv/videos/[id]/play/route.ts",
      health_check: "scripts/run-tv-health-checks.ts / npm run tv:health",
    },
    hope_channel_row: hope.data,
    hope_error: hope.error?.message || null,
    catalog_oyerepa: catalogSearch.data || [],
    catalog_oyerepa_error: catalogSearch.error?.message || null,
    public_ghana_api_status: publicGhana.status,
    public_ghana_total: (publicGhanaJson as { pagination?: { total?: number } })?.pagination?.total ?? null,
    public_oyerepa_search: publicSearchJson,
    official_pages: pageResults,
    iptv_org: {
      channel: iptv.channel,
      stream_count: (iptv.streamHits || []).length,
      streams: iptv.streamHits,
    },
    candidates_tested: probeResults,
    viable_native_streams: viable,
    staging_policy: {
      hls_path: "verify-then-insert; failed probes are not written as playable rows",
      pending_without_stream: "not supported for HLS growth path; would require fake/empty stream",
      action_taken: viable.length
        ? "would_import_via_tv_growth"
        : "no_insert_keep_pending_verification",
    },
    oyerepa_tv_imported: false,
    final_verdict: viable.length ? "PLAYABLE_AND_VERIFIED_CANDIDATE_FOUND" : "PENDING_VERIFICATION",
    finished_at: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(RESULT), { recursive: true });
  fs.writeFileSync(RESULT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

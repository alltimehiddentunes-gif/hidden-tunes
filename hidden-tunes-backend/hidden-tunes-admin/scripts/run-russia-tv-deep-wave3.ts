/**
 * Russia TV wave3: additional official / Tier-1 public HLS probes (dry-run by default).
 * npx tsx scripts/run-russia-tv-deep-wave3.ts [--execute] [--concurrency=4]
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { probeStreamUrl } from "@/lib/tvStreamProtocol";
import {
  importVerifiedTvGrowthCandidates,
  probeTvStation,
  type TvGrowthCandidate,
} from "@/lib/tvStationHealth";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);
const OUT = path.join(adminRoot, "data", "russia-tv-deep");
const execute = process.argv.includes("--execute");
const concurrency = Number(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] || 4);

type Cand = {
  title: string;
  nativeName: string;
  url: string;
  category: string;
  website: string;
  region?: string;
  provenance: string;
};

/** Official or broadcaster-CDN candidates (Tier 1). No anonymous IPTV lists. */
const CANDIDATES: Cand[] = [
  { title: "Russia 1", nativeName: "Россия 1", url: "https://stream.smotrim.ru/hls2/russia_hd/playlist_6.m3u8", category: "news", website: "https://smotrim.ru/", provenance: "smotrim.ru" },
  { title: "Russia K", nativeName: "Россия К", url: "https://stream.smotrim.ru/hls2/russia_k/playlist_5.m3u8", category: "culture", website: "https://smotrim.ru/", provenance: "smotrim.ru" },
  { title: "RTR Planeta Asia", nativeName: "РТР-Планета", url: "https://stream.smotrim.ru/hls2/planeta_rtr_asia/playlist_4.m3u8", category: "general", website: "https://smotrim.ru/", provenance: "smotrim.ru" },
  { title: "Moskva 24", nativeName: "Москва 24", url: "https://stream.smotrim.ru/hls2/moscow_24/playlist_3.m3u8", category: "news", website: "https://www.m24.ru/", provenance: "smotrim.ru" },
  { title: "RT News", nativeName: "RT", url: "https://rt-global.rttv.com/live/rtnews/playlist.m3u8", category: "news", website: "https://www.rt.com/", provenance: "rttv.com" },
  { title: "RT Documentary", nativeName: "RT Documentary", url: "https://rt-doc.rttv.com/live/rtdoc/playlist.m3u8", category: "documentary", website: "https://www.rt.com/", provenance: "rttv.com" },
  { title: "RT Arabic", nativeName: "RT Arabic", url: "https://rt-arb.rttv.com/dvr/rtarab/playlist.m3u8", category: "news", website: "https://arabic.rt.com/", provenance: "rttv.com" },
  { title: "RT Balkan", nativeName: "RT Balkan", url: "https://rt-srb.rttv.com/live/rtbalkan/playlist.m3u8", category: "news", website: "https://lat.rttv.com/", provenance: "rttv.com" },
  { title: "RT French", nativeName: "RT France", url: "https://rt-fra.rttv.com/live/rtfrance/playlist.m3u8", category: "news", website: "https://francais.rt.com/", provenance: "rttv.com" },
  { title: "RT Spanish", nativeName: "RT en Español", url: "https://rt-esp.rttv.com/live/rtesp/playlist.m3u8", category: "news", website: "https://actualidad.rt.com/", provenance: "rttv.com" },
  { title: "Mir", nativeName: "Мир", url: "https://hls.mirtv.cdnvideo.ru/mirtv-parampublish/mirtv_2500/playlist.m3u8", category: "general", website: "https://mirtv.ru/", provenance: "mirtv.cdnvideo.ru" },
  { title: "Mir 24", nativeName: "Мир 24", url: "https://hls.mirtv.cdnvideo.ru/mirtv-parampublish/mirtv24_2500/playlist.m3u8", category: "news", website: "https://mir24.tv/", provenance: "mirtv.cdnvideo.ru" },
  { title: "TV Centr", nativeName: "ТВ Центр", url: "https://tvc-hls.cdnvideo.ru/tvc-res/smil:vd9221.smil/playlist.m3u8", category: "general", website: "https://www.tvc.ru/", provenance: "tvc-hls.cdnvideo.ru" },
  { title: "Spas", nativeName: "Спас", url: "https://tvspas.mediacdn.ru/cdn/spas/playlist.m3u8", category: "religious", website: "https://spastv.ru/", provenance: "mediacdn.ru" },
  { title: "3ABN Russia", nativeName: "Три Ангела", url: "https://hls.tv.3angels.ru/stream.m3u8", category: "religious", website: "https://3angels.ru/", provenance: "3angels.ru" },
  { title: "Univer TV", nativeName: "Универ ТВ", url: "https://cdn.universmotri.ru/live/smil:mbr.smil/playlist.m3u8", category: "education", website: "https://universmotri.ru/", provenance: "universmotri.ru" },
  { title: "BST Bratsk", nativeName: "БСТ", url: "https://bst.bratsk.ru/hls/bst2/index.m3u8", category: "regional", website: "https://bst.bratsk.ru/", region: "Irkutsk", provenance: "bst.bratsk.ru" },
  { title: "Channel 12", nativeName: "12 канал", url: "https://12channel.bonus-tv.ru/cdn/12channel/playlist.m3u8", category: "regional", website: "https://12channel.ru/", region: "Omsk", provenance: "bonus-tv.ru" },
  { title: "Sibir 24", nativeName: "Сибирь 24", url: "https://vgtrkregion-reg.cdnvideo.ru/vgtrk/krasnoyarsk/sibir24-hd/index.m3u8", category: "regional", website: "https://vesti-siberia.ru/", region: "Krasnoyarsk", provenance: "vgtrkregion CDN" },
  { title: "Vostok 24", nativeName: "Восток 24", url: "https://vgtrkregion-reg.cdnvideo.ru/vgtrk/vladivostok/vostok24-hd/index.m3u8", category: "regional", website: "https://vestiprim.ru/", region: "Primorye", provenance: "vgtrkregion CDN" },
  { title: "Volgograd 24", nativeName: "Волгоград 24", url: "https://vgtrkregion-reg.cdnvideo.ru/vgtrk/volgograd/russia1-hd/index.m3u8", category: "regional", website: "https://volgograd-trv.ru/", region: "Volgograd", provenance: "vgtrkregion CDN" },
  { title: "Nizhniy Novgorod 24", nativeName: "Нижний Новгород 24", url: "https://live-vestinn.cdnvideo.ru/vestinn/nn24-khl/playlist.m3u8", category: "regional", website: "https://vestinn.ru/", region: "Nizhny Novgorod", provenance: "vestinn CDN" },
  { title: "Shchyolkovskoe TV", nativeName: "Щёлковское ТВ", url: "https://stream1.tv41.ru/hls/live.m3u8", category: "municipal", website: "https://tv41.ru/", region: "Moscow Oblast", provenance: "tv41.ru" },
  { title: "Tamyr", nativeName: "Тамыр", url: "https://bstonline.mediacdn.ru/cdn/tamyr/playlist.m3u8", category: "regional", website: "https://tamyr.tv/", region: "Bashkortostan", provenance: "mediacdn.ru" },
  { title: "RTVi", nativeName: "RTVi", url: "https://s70378.cdn.ngenix.net/rtvi/index.m3u8", category: "news", website: "https://rtvi.com/", provenance: "ngenix rtvi" },
  { title: "Russia 24 VGTRK", nativeName: "Россия 24", url: "https://vgtrkregion-reg.cdnvideo.ru/vgtrk/0/russia24-hd/index.m3u8", category: "news", website: "https://www.vesti.ru/", provenance: "vgtrkregion CDN" },
  { title: "OTR official", nativeName: "ОТР", url: "https://live-otronline.cdnvideo.ru/otr-decklink/otr_ru_720p/playlist.m3u8", category: "general", website: "https://otr-online.ru/", provenance: "otr-online CDN" },
  { title: "OTR zabava", nativeName: "ОТР", url: "https://zabava-htlive.cdn.ngenix.net/hls/CH_OTR/variant.m3u8", category: "general", website: "https://otr-online.ru/", provenance: "ngenix zabava (geo likely)" },
  { title: "Russia 1 zabava", nativeName: "Россия 1", url: "https://zabava-htlive.cdn.ngenix.net/hls/CH_RUSSIA1/variant.m3u8", category: "news", website: "https://russia.tv/", provenance: "ngenix zabava (geo likely)" },
  { title: "Russia 24 zabava", nativeName: "Россия 24", url: "https://zabava-htlive.cdn.ngenix.net/hls/CH_RUSSIA24/variant.m3u8", category: "news", website: "https://www.vesti.ru/", provenance: "ngenix zabava (geo likely)" },
  { title: "Moskva 24 zabava", nativeName: "Москва 24", url: "https://rt-mos-htlive.cdn.ngenix.net/hls/CH_R04_OTT_MOSKOV24/variant.m3u8", category: "news", website: "https://www.m24.ru/", provenance: "ngenix moscow (geo likely)" },
];

function urlKey(u: string) {
  return String(u || "").trim().replace(/\/+$/, "").toLowerCase();
}
function titleKey(t: string) {
  return String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
function sanitize(url: string) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (/token|sig|signature|exp|expires|auth|key|session/i.test(k)) u.searchParams.set(k, "[redacted]");
    }
    return u.toString();
  } catch {
    return url.slice(0, 180);
  }
}

async function loadCatalog() {
  const sb = getSupabaseAdmin();
  const urls = new Set<string>();
  const titles = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("tv_videos")
      .select("source_url,validated_stream_url,title,region")
      .or("region.eq.RU,region.ilike.RU_%")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) {
      if (r.source_url) urls.add(urlKey(r.source_url));
      if (r.validated_stream_url) urls.add(urlKey(r.validated_stream_url));
      titles.add(`${titleKey(String(r.title || ""))}::ru`);
    }
    if (data.length < 1000) break;
  }
  return { urls, titles };
}

async function mapPool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, n) }, async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(JSON.stringify({ execute, concurrency, candidates: CANDIDATES.length }, null, 2));
  const catalog = await loadCatalog();
  const results = await mapPool(CANDIDATES, concurrency, async (c) => {
    const uk = urlKey(c.url);
    const dup = catalog.urls.has(uk) || catalog.titles.has(`${titleKey(c.title)}::ru`) || catalog.titles.has(`${titleKey(c.nativeName)}::ru`);
    if (dup) {
      return { ...c, status: "duplicate", sanitizedUrl: sanitize(c.url), probe: null };
    }
    const probe = await probeStreamUrl(c.url);
    let station: Awaited<ReturnType<typeof probeTvStation>> | null = null;
    try {
      station = await probeTvStation({
        id: `wave3-${createHash("sha1").update(c.url).digest("hex").slice(0, 12)}`,
        title: c.title,
        source_url: c.url,
        validated_stream_url: c.url,
        region: "RU",
      } as never);
    } catch {
      station = null;
    }
    const playable = Boolean(probe?.ok && probe?.isHls && !probe?.geoRestricted && !probe?.authRequired && !probe?.drm);
    let status = "rejected";
    if (probe?.geoRestricted || String(probe?.error || "").includes("403")) status = "geo_restricted";
    else if (probe?.authRequired) status = "authentication_required";
    else if (probe?.drm) status = "drm_unsupported";
    else if (!probe?.ok) status = "dead";
    else if (playable) status = "verified_playable";
    else status = "playable_unstable";
    return {
      ...c,
      status,
      sanitizedUrl: sanitize(c.url),
      probe: {
        ok: probe?.ok ?? false,
        protocol: probe?.protocol ?? null,
        isHls: probe?.isHls ?? false,
        geoRestricted: probe?.geoRestricted ?? false,
        authRequired: probe?.authRequired ?? false,
        drm: probe?.drm ?? false,
        error: probe?.error ?? null,
        finalUrl: probe?.finalUrl ? sanitize(probe.finalUrl) : null,
      },
      stationOk: station?.ok ?? null,
    };
  });

  const verified = results.filter((r) => r.status === "verified_playable");
  const report: Record<string, unknown> = {
    at: new Date().toISOString(),
    execute,
    totals: {
      candidates: results.length,
      duplicate: results.filter((r) => r.status === "duplicate").length,
      verified_playable: verified.length,
      geo_restricted: results.filter((r) => r.status === "geo_restricted").length,
      dead: results.filter((r) => r.status === "dead").length,
      authentication_required: results.filter((r) => r.status === "authentication_required").length,
      other: results.filter((r) => !["duplicate", "verified_playable", "geo_restricted", "dead", "authentication_required"].includes(r.status)).length,
    },
    results,
    import: null as unknown,
  };

  if (execute && verified.length) {
    const growth: TvGrowthCandidate[] = verified.map((v) => ({
      title: v.title,
      source_url: v.url,
      region: "RU",
      language: "ru",
      category: v.category,
      channel_name: v.nativeName,
      thumbnail_url: null,
      source_type: "hls_stream",
      source_id: `russia-wave3-${createHash("sha1").update(v.url).digest("hex").slice(0, 16)}`,
      source_key: `russia-tv-deep-wave3:${createHash("sha1").update(v.url).digest("hex").slice(0, 16)}`,
      reliability_score: 85,
      ios_playable: true,
      android_playable: true,
      stream_protocol: "hls",
      validated_stream_url: v.url,
    }));
    const imported = await importVerifiedTvGrowthCandidates(growth);
    report.import = imported;
  } else {
    report.import = { skipped: true, reason: execute ? "no_verified_new" : "dry_run" };
  }

  const outPath = path.join(OUT, "08-wave3-official-probe.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ outPath, totals: report.totals, import: report.import }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Russia TV wave2: import net-new URLs + repair failed rows via alternate verified streams.
 *   npx tsx scripts/run-russia-tv-deep-wave2.ts
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

const PIRATE =
  /thestream\.cyou|mcquack|russkoe-iptv|freeott|cinerama\.uz|rutube\.ru|youtube|goodstream\.icu|facebook|twitch|vk\.com/i;

function titleKey(t: string) {
  return String(t || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .replace(/(hd|fhd|4k|online|live)/g, "");
}
function urlKey(u: string) {
  return String(u || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
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

async function loadAllCatalogUrlsAndKeys() {
  const sb = getSupabaseAdmin();
  const urls = new Set<string>();
  const keys = new Set<string>();
  const titleCountry = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("tv_videos")
      .select("source_url,validated_stream_url,source_key,title,region")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) {
      if (r.source_url) urls.add(urlKey(r.source_url));
      if (r.validated_stream_url) urls.add(urlKey(r.validated_stream_url));
      if (r.source_key) keys.add(String(r.source_key));
      titleCountry.add(
        `${String(r.title || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ")}::${String(r.region || "")
          .trim()
          .toLowerCase()}`
      );
    }
    if (data.length < 1000) break;
  }
  return { urls, keys, titleCountry };
}

async function loadBrokenRussiaRows() {
  const sb = getSupabaseAdmin();
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("tv_videos")
      .select(
        "id,title,source_url,validated_stream_url,playback_status,status,is_active,reliability_score,quarantined_at,disabled_at,region,source_key"
      )
      .or("region.eq.RU,region.ilike.RU_%")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) {
      const bad =
        r.playback_status !== "playable" ||
        !r.is_active ||
        r.status !== "approved" ||
        Number(r.reliability_score ?? 100) < 60 ||
        r.quarantined_at ||
        r.disabled_at;
      if (bad) rows.push(r);
    }
    if (data.length < 1000) break;
  }
  return rows;
}

async function main() {
  const discovery = JSON.parse(
    fs.readFileSync(path.join(OUT, "02-discovery.json"), "utf8")
  ) as { candidates: Array<Record<string, unknown>> };
  const accepted = JSON.parse(
    fs.readFileSync(path.join(OUT, "03-accepted.json"), "utf8")
  ) as Array<Record<string, unknown>>;

  console.log("[wave2] loading catalog keys...");
  const catalog = await loadAllCatalogUrlsAndKeys();
  console.log(
    `[wave2] catalog urls=${catalog.urls.size} keys=${catalog.keys.size}`
  );

  // Net-new candidates: URL + source_key not in catalog
  const netNew: TvGrowthCandidate[] = [];
  const seen = new Set<string>();
  for (const c of discovery.candidates) {
    const url = String(c.sourceUrl || "");
    const title = String(c.title || "");
    if (!url || !title || PIRATE.test(url)) continue;
    if (!/\.(m3u8|mpd)(\?|$)/i.test(url)) continue;
    const uk = urlKey(url);
    if (catalog.urls.has(uk) || seen.has(uk)) continue;
    const iptvId = c.iptvOrgId ? String(c.iptvOrgId) : "";
    const sourceKey = iptvId
      ? `iptv-org:${iptvId}`
      : `russia-tv-deep:${createHash("sha1").update(uk).digest("hex").slice(0, 16)}`;
    if (catalog.keys.has(sourceKey)) continue;
    const titleCountryKey = `${title.trim().toLowerCase().replace(/\s+/g, " ")}::ru`;
    if (catalog.titleCountry.has(titleCountryKey)) continue;
    seen.add(uk);
    netNew.push({
      source_type: "hls_stream",
      source_id: iptvId ? `iptv-org-${iptvId}` : sourceKey.replace("russia-tv-deep:", "ru-"),
      source_url: url,
      title,
      channel_name: String(c.nativeName || title),
      thumbnail_url: (c.logo as string) || null,
      category: (c.category as string) || "General",
      language: (c.language as string) || "ru",
      country: "RU",
      region: (c.region as string) || null,
      tags: ["Russia", "RU", "russia-tv-deep", String(c.category || "")].filter(Boolean),
      source_key: sourceKey,
    });
  }

  console.log(`[wave2] net-new URL candidates=${netNew.length}`);
  fs.writeFileSync(
    path.join(OUT, "07-net-new-candidates.json"),
    JSON.stringify(
      {
        count: netNew.length,
        sample: netNew.slice(0, 40).map((c) => ({
          title: c.title,
          url: sanitize(c.source_url),
          source_key: c.source_key,
        })),
      },
      null,
      2
    )
  );

  // Verify + import net-new with bounded concurrency
  const verifiedNew: TvGrowthCandidate[] = [];
  const verifyRejects: Array<Record<string, unknown>> = [];
  for (let i = 0; i < netNew.length; i++) {
    const c = netNew[i];
    const probe = await probeStreamUrl(c.source_url);
    if (!probe.playable) {
      verifyRejects.push({ title: c.title, reason: probe.reason, url: sanitize(c.source_url) });
      continue;
    }
    const station = await probeTvStation({
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
    if (!station.playable) {
      verifyRejects.push({
        title: c.title,
        reason: station.reason,
        url: sanitize(c.source_url),
      });
      continue;
    }
    verifiedNew.push(c);
    if ((i + 1) % 20 === 0) {
      console.log(
        `[wave2] net-new verify ${i + 1}/${netNew.length} ok=${verifiedNew.length}`
      );
    }
  }

  console.log(`[wave2] net-new verified=${verifiedNew.length}`);
  const importResult =
    verifiedNew.length > 0
      ? await importVerifiedTvGrowthCandidates(verifiedNew)
      : { found: 0, unique: 0, imported: 0, rejected: 0 };
  console.log(`[wave2] import`, importResult);

  // Resolve imported IDs
  const sb = getSupabaseAdmin();
  const importedMeta: Array<Record<string, unknown>> = [];
  for (const c of verifiedNew) {
    const { data } = await sb
      .from("tv_videos")
      .select("id,title,source_key,playback_status,stream_protocol,validated_stream_url")
      .eq("source_key", c.source_key || "")
      .maybeSingle();
    if (data?.id) {
      importedMeta.push({
        id: data.id,
        title: data.title,
        source_key: data.source_key,
        playback_status: data.playback_status,
        protocol: data.stream_protocol,
        url: data.validated_stream_url ? sanitize(data.validated_stream_url) : null,
      });
    }
  }

  // Alt repair for broken RU rows
  console.log("[wave2] loading broken RU rows...");
  const broken = await loadBrokenRussiaRows();
  const byTitle = new Map<string, string[]>();
  for (const c of discovery.candidates) {
    const u = String(c.sourceUrl || "");
    if (!u || PIRATE.test(u)) continue;
    const k = titleKey(String(c.title || ""));
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k)!.push(u);
  }
  for (const a of accepted) {
    const cand = a.candidate as { sourceUrl?: string; title?: string } | undefined;
    const u = String(cand?.sourceUrl || a.sourceUrl || "");
    if (!u || PIRATE.test(u)) continue;
    const k = titleKey(String(a.title || cand?.title || ""));
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k)!.push(u);
  }

  const repairs: Array<Record<string, unknown>> = [];
  const repairFails: Array<Record<string, unknown>> = [];
  for (const row of broken) {
    const current = urlKey(String(row.validated_stream_url || row.source_url || ""));
    const alts = [...new Set((byTitle.get(titleKey(String(row.title || ""))) || []).filter((u) => urlKey(u) !== current))];
    if (!alts.length) continue;
    let chosen: string | null = null;
    let probe: Awaited<ReturnType<typeof probeTvStation>> | null = null;
    for (const url of alts.slice(0, 3)) {
      const p = await probeStreamUrl(url);
      if (!p.playable) continue;
      const sp = await probeTvStation({
        id: String(row.id),
        source_type: "hls_stream",
        source_id: String(row.source_key || row.id),
        source_url: url,
        embed_url: null,
        title: String(row.title || ""),
        status: "approved",
        playback_status: "unchecked",
        is_active: false,
        reliability_score: 100,
        consecutive_failures: 0,
      });
      if (sp.playable) {
        chosen = url;
        probe = sp;
        break;
      }
    }
    if (!chosen || !probe) {
      repairFails.push({ id: row.id, title: row.title, tried: alts.length });
      continue;
    }
    const patch = {
      source_url: chosen,
      validated_stream_url: probe.validated_stream_url || chosen,
      playback_status: "playable" as const,
      status: "approved",
      is_active: true,
      reliability_score: Math.max(80, Number(row.reliability_score || 0)),
      consecutive_failures: 0,
      quarantined_at: null,
      disabled_at: null,
      last_health_checked_at: new Date().toISOString(),
      last_health_error: null,
      ios_playable: probe.ios_playable === true,
      android_playable: probe.android_playable === true,
      stream_protocol: probe.stream_protocol || "hls",
      stream_is_https: probe.stream_is_https === true,
      last_validation_result: probe.last_validation_result || "russia_tv_deep_wave2_repair",
      region: String(row.region || "").toUpperCase().startsWith("RU")
        ? row.region
        : "RU",
    };
    const { error } = await sb.from("tv_videos").update(patch).eq("id", row.id);
    if (error) {
      repairFails.push({ id: row.id, title: row.title, reason: error.message });
      continue;
    }
    repairs.push({
      id: row.id,
      title: row.title,
      previous: row.playback_status,
      newUrl: sanitize(chosen),
    });
    if (repairs.length % 5 === 0) console.log(`[wave2] alt-repair ${repairs.length}`);
  }

  // Explicit OTR public stream attempt
  const otrUrl =
    "https://live-otronline.cdnvideo.ru/otr-decklink/otr_ru_720p/playlist.m3u8";
  let otrResult: Record<string, unknown> | null = null;
  if (!catalog.urls.has(urlKey(otrUrl))) {
    const probe = await probeStreamUrl(otrUrl);
    const station = probe.playable
      ? await probeTvStation({
          id: "otr",
          source_type: "hls_stream",
          source_id: "otr-ru",
          source_url: otrUrl,
          embed_url: null,
          title: "ОТР",
          status: "approved",
          playback_status: "unchecked",
          is_active: false,
          reliability_score: 100,
          consecutive_failures: 0,
        })
      : null;
    if (station?.playable) {
      const otrCandidate: TvGrowthCandidate = {
        source_type: "hls_stream",
        source_id: "official-otr-ru",
        source_url: otrUrl,
        title: "ОТР",
        channel_name: "Общественное телевидение России",
        category: "Public",
        language: "ru",
        country: "RU",
        region: "Moscow",
        tags: ["Russia", "RU", "Public", "russia-tv-deep"],
        source_key: "russia-tv-deep:otr-official",
      };
      const otrImport = await importVerifiedTvGrowthCandidates([otrCandidate]);
      otrResult = { probe: probe.reason, import: otrImport, url: sanitize(otrUrl) };
    } else {
      otrResult = {
        probe: probe.reason,
        station: station?.reason || null,
        url: sanitize(otrUrl),
      };
    }
  } else {
    otrResult = { skipped: "already_in_catalog", url: sanitize(otrUrl) };
  }

  const report = {
    at: new Date().toISOString(),
    netNewCandidates: netNew.length,
    netNewVerified: verifiedNew.length,
    netNewImport: importResult,
    importedMeta,
    verifyRejects: verifyRejects.length,
    verifyRejectSample: verifyRejects.slice(0, 40),
    brokenRows: broken.length,
    altRepaired: repairs.length,
    altRepairFails: repairFails.length,
    repairs,
    otrResult,
  };
  fs.writeFileSync(path.join(OUT, "07-wave2-report.json"), JSON.stringify(report, null, 2));

  const cp = JSON.parse(fs.readFileSync(path.join(OUT, "checkpoint.json"), "utf8"));
  for (const m of importedMeta) {
    if (m.id && !cp.importedIds.includes(m.id)) cp.importedIds.push(m.id);
  }
  for (const r of repairs) {
    if (r.id && !cp.repairedIds.includes(r.id)) cp.repairedIds.push(r.id);
  }
  cp.stats.wave2Imported = importResult.imported;
  cp.stats.wave2AltRepaired = repairs.length;
  cp.updatedAt = new Date().toISOString();
  if (!cp.phasesCompleted.includes("wave2")) cp.phasesCompleted.push("wave2");
  fs.writeFileSync(path.join(OUT, "checkpoint.json"), JSON.stringify(cp, null, 2));

  console.log(
    JSON.stringify(
      {
        netNewVerified: verifiedNew.length,
        imported: importResult.imported,
        altRepaired: repairs.length,
        otrResult,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

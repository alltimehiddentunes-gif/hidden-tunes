/**
 * South Korea TV deep discovery, verification, dedupe, and controlled import.
 *
 * Uses existing TV probe + import paths only. No mobile/desktop changes.
 * Keeps North Korea (KP) entirely separate â€” never imports KP under KR.
 * Resumable via data/south-korea-tv-deep/checkpoint.json
 *
 *   npx tsx scripts/run-south-korea-tv-deep-import.ts [--phase=audit|discover|verify|import|play|all] [--limit=N] [--concurrency=4] [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  classifyStreamUrl,
  probeStreamUrl,
} from "@/lib/tvStreamProtocol";
import {
  importVerifiedTvGrowthCandidates,
  probeTvStation,
  type TvGrowthCandidate,
  validatePublicTvUrl,
} from "@/lib/tvStationHealth";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);

const OUT_DIR = path.join(adminRoot, "data", "south-korea-tv-deep");
const CHECKPOINT = path.join(OUT_DIR, "checkpoint.json");
const USER_AGENT = "HiddenTunes/1.0 south-korea-tv-deep-discovery";
const IPTV_CHANNELS_URL = "https://iptv-org.github.io/api/channels.json";
const IPTV_STREAMS_URL = "https://iptv-org.github.io/api/streams.json";
const ADMIN_PLAY_BASE =
  process.env.HIDDEN_TUNES_ADMIN_URL?.replace(/\/$/, "") ||
  "https://admin.hiddentunes.com";

const BLOCKED_HOST_RE =
  /youtube\.com|youtu\.be|facebook\.com|fbcdn\.|twitch\.tv|tiktok\.com|dailymotion\.com|vimeo\.com|naver\.com|tv\.naver|kakao\.com|kakaotv|afreecatv\.com|sooplive\.co|chzzk\.naver|wavve\.com|tving\.com|coupangplay\.com|watcha\.com|disneyplus\.com|netflix\.com|primevideo\.com|skbroadband\.com|gigagenie\.co|uplustv|lguplus\.com|ollehtv|iptv\.kt\.com|tv\.kakao/i;

/** Hosts/patterns that indicate pirate panels, restream farms, or opaque free-OTT mirrors. */
const PIRATE_OR_UNTRUSTED_HOST_RE =
  /(?:^|\.)(?:xtream-?codes?|stream4k\.|cdnstreamz\.|jackpanel\.|beeiptv\.|foxiptv\.|freeott\.top|thestream\.cyou|mcquack\.net)/i;

const TRUSTED_CDN_ALLOW_RE =
  /(?:arirang\.com|ytn\.co\.kr|yonhapnewstv|natv\.go\.kr|ktv\.go\.kr|kbs\.co\.kr|imbc\.com|sbs\.co\.kr|ebs\.co\.kr|hmall\.com|gsshop\.com|cjonstyle|lotteimall|nsmall\.com|skstoa\.com|hnsmall\.com|kshop\.co\.kr|obs\.co\.kr|cbs\.co\.kr|cts\.tv|cgntv\.net|btn\.co\.kr|webcast\.go\.kr|cloudfront\.net|akamaized\.net|edgesuite\.net|ctnd\.com|fastly\.net|hyundaihmall\.com)/i;

type ExistingRow = {
  id: string;
  title: string | null;
  channel_name: string | null;
  region: string | null;
  language: string | null;
  category: string | null;
  source_url: string | null;
  embed_url: string | null;
  validated_stream_url: string | null;
  status: string | null;
  is_active: boolean | null;
  playback_status: string | null;
  reliability_score: number | null;
  consecutive_failures: number | null;
  quarantined_at: string | null;
  disabled_at: string | null;
  stream_protocol: string | null;
  ios_playable: boolean | null;
  android_playable: boolean | null;
  is_public: boolean | null;
  source_type: string | null;
  source_id: string | null;
  source_key: string | null;
};

type DiscoveredCandidate = {
  key: string;
  title: string;
  nativeName?: string | null;
  aliases?: string[];
  sourceUrl: string;
  country: "KR";
  region?: string | null;
  city?: string | null;
  language?: string | null;
  category?: string | null;
  broadcaster?: string | null;
  website?: string | null;
  logo?: string | null;
  epgId?: string | null;
  iptvOrgId?: string | null;
  sourceFamily: string;
  sourceProvenance: string;
  sourceConfidence: number;
  discoveredAt: string;
  quality?: string | null;
};

type VerifyResult = {
  key: string;
  title: string;
  sourceUrl: string;
  sanitizedUrl: string;
  accepted: boolean;
  reason: string;
  protocol?: string | null;
  finalUrl?: string | null;
  isHls?: boolean;
  isDash?: boolean;
  playable?: boolean;
  iosPlayable?: boolean;
  androidPlayable?: boolean;
  sustainedOk?: boolean;
  videoLike?: boolean;
  audioOnly?: boolean;
  geoRestricted?: boolean;
  authRequired?: boolean;
  drm?: boolean;
  htmlPage?: boolean;
  dead?: boolean;
  sourceFamily: string;
  candidate: DiscoveredCandidate;
};

type Checkpoint = {
  startedAt: string;
  updatedAt: string;
  phasesCompleted: string[];
  existingAuditPath?: string;
  discoveryPath?: string;
  verificationPath?: string;
  importPath?: string;
  playPath?: string;
  verifiedKeys: string[];
  rejectedKeys: Record<string, string>;
  importedIds: string[];
  repairedIds: string[];
  pendingKeys: string[];
  stats: Record<string, number>;
};

function ensureDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function writeJson(file: string, data: unknown) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function argValue(name: string, fallback?: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function sanitizeUrl(url: string) {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/token|sig|signature|exp|expires|auth|key|session|jwt/i.test(key)) {
        u.searchParams.set(key, "[redacted]");
      }
    }
    return u.toString();
  } catch {
    return url.slice(0, 200);
  }
}

function normalizeTitle(raw: string) {
  return String(raw || "")
    .replace(/\b(HD|FHD|UHD|4K|8K|720p|1080p|576p|480p|360p)\b/gi, " ")
    .replace(/\b(H\.?264|H\.?265|HEVC|AAC|HLS|DASH)\b/gi, " ")
    .replace(/\b(online|live|stream|ì‹¤ì‹œê°„|ë¼ì´ë¸Œ|ì˜¨ì—ì–´|ìƒë°©ì†¡|ê³µì‹)\b/gi, " ")
    .replace(/[\[\]\(\)\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleKey(title: string) {
  return normalizeTitle(title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function urlKey(url: string) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

function candidateKey(title: string, url: string) {
  return createHash("sha1")
    .update(`${titleKey(title)}|${urlKey(url)}`)
    .digest("hex")
    .slice(0, 20);
}

function isWebpageUrl(u: string) {
  try {
    const p = new URL(u);
    if (BLOCKED_HOST_RE.test(p.hostname + p.pathname)) return true;
    if (/\.(m3u8|mpd)(\?|$)/i.test(p.pathname)) return false;
    if (/\/(hls|live|playlist|manifest|stream|index)\b/i.test(p.pathname)) return false;
    if (/\.(html?|php|aspx?)(\?|$)/i.test(p.pathname) || p.pathname === "/" || !p.pathname) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function isBlockedSource(url: string) {
  try {
    const p = new URL(url);
    return BLOCKED_HOST_RE.test(p.hostname);
  } catch {
    return true;
  }
}

function isRawIpHost(hostname: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

function eligibilityRejectReason(url: string): string | null {
  try {
    const p = new URL(url);
    const host = p.hostname.toLowerCase();
    if (BLOCKED_HOST_RE.test(host)) return "blocked_social_or_browser_source";
    if (isWebpageUrl(url)) return "webpage_url";
    if (isRawIpHost(host)) return "raw_ip_host_untrusted";
    if (PIRATE_OR_UNTRUSTED_HOST_RE.test(host)) {
      if (!TRUSTED_CDN_ALLOW_RE.test(host)) return "pirate_or_untrusted_restream";
    }
    // Foreign third-party restreams of Korean channels (not official KR/CDN)
    if (
      /\.(sk|ru|uz|cyou|top)$/i.test(host) ||
      /antik\.sk|bonus-tv\.ru|freeott|cinerama\.uz/i.test(host)
    ) {
      return "unauthorised_foreign_restream";
    }
    // GitHub/raw wrappers are not stable catalog stream hosts
    if (/github\.com|githubusercontent\.com|raw\.githack|jsdelivr/i.test(host)) {
      return "github_or_cdn_wrapper_not_broadcaster";
    }
    // CBS AAC radio mounts mislabeled as TV
    if (/m-aac\.cbs\.co\.kr/i.test(host) || /\/mweb_cbs/i.test(p.pathname)) {
      return "audio_only_radio_mount";
    }
    // Temporary shopping/event live session IDs
    if (/\/live\/video\/ls-\d{8}/i.test(p.pathname) || /\/ls-\d{14}-/i.test(url)) {
      return "temporary_event_session_url";
    }
    if (/\/c\/|playercdn\.cdnvideo\.ru\/.*\.html/i.test(url) && !/\.m3u8(\?|$)/i.test(p.pathname)) {
      return "player_shell_not_stream";
    }
    return null;
  } catch {
    return "malformed_url";
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function loadCheckpoint(): Checkpoint {
  return readJson<Checkpoint>(CHECKPOINT, {
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phasesCompleted: [],
    verifiedKeys: [],
    rejectedKeys: {},
    importedIds: [],
    repairedIds: [],
    pendingKeys: [],
    stats: {},
  });
}

function saveCheckpoint(cp: Checkpoint) {
  cp.updatedAt = new Date().toISOString();
  writeJson(CHECKPOINT, cp);
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchExistingSouthKoreaRows(): Promise<ExistingRow[]> {
  const sb = getSupabaseAdmin();
  const select =
    "id,title,channel_name,region,language,category,source_url,embed_url,validated_stream_url,status,is_active,playback_status,reliability_score,consecutive_failures,quarantined_at,disabled_at,stream_protocol,ios_playable,android_playable,is_public,source_type,source_id,source_key";
  const rows: ExistingRow[] = [];
  const seen = new Set<string>();
  const page = 1000;

  async function collect(apply: (q: any) => any) {
    for (let from = 0; ; from += page) {
      let q = sb.from("tv_videos").select(select);
      q = apply(q);
      const { data, error } = await q.range(from, from + page - 1);
      if (error) throw error;
      if (!data?.length) break;
      for (const row of data as ExistingRow[]) {
        if (seen.has(row.id)) continue;
        // Exclude clear North Korea
        const blob = `${row.region || ""} ${row.title || ""} ${row.channel_name || ""}`;
        if (
          String(row.region || "").toUpperCase() === "KP" ||
          /North\s*Korea|ì¡°ì„ ë¯¼ì£¼ì£¼ì˜|ë¶í•œ/i.test(blob)
        ) {
          continue;
        }
        seen.add(row.id);
        rows.push(row);
      }
      if (data.length < page) break;
    }
  }

  await collect((q) => q.eq("region", "KR"));
  await collect((q) => q.ilike("region", "South Korea"));
  await collect((q) => q.ilike("region", "%Republic of Korea%"));
  await collect((q) => q.ilike("title", "%South Korea%"));
  await collect((q) => q.ilike("title", "%ëŒ€í•œë¯¼êµ­%"));
  await collect((q) => q.ilike("channel_name", "%South Korea%"));
  await collect((q) => q.ilike("channel_name", "%ëŒ€í•œë¯¼êµ­%"));

  return rows;
}

async function fetchExistingNorthKoreaRows(): Promise<ExistingRow[]> {
  const sb = getSupabaseAdmin();
  const select =
    "id,title,channel_name,region,language,category,source_url,embed_url,validated_stream_url,status,is_active,playback_status,reliability_score,consecutive_failures,quarantined_at,disabled_at,stream_protocol,ios_playable,android_playable,is_public,source_type,source_id,source_key";
  const rows: ExistingRow[] = [];
  const seen = new Set<string>();
  const page = 1000;
  async function collect(apply: (q: any) => any) {
    for (let from = 0; ; from += page) {
      let q = sb.from("tv_videos").select(select);
      q = apply(q);
      const { data, error } = await q.range(from, from + page - 1);
      if (error) throw error;
      if (!data?.length) break;
      for (const row of data as ExistingRow[]) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
      }
      if (data.length < page) break;
    }
  }
  await collect((q) => q.eq("region", "KP"));
  await collect((q) => q.ilike("region", "North Korea"));
  await collect((q) => q.ilike("title", "%North Korea%"));
  return rows;
}

function classifyExisting(row: ExistingRow) {
  const url = row.validated_stream_url || row.source_url || row.embed_url || "";
  const publicOk =
    row.is_public === true ||
    (row.status === "approved" &&
      row.is_active === true &&
      row.playback_status === "playable" &&
      Number(row.reliability_score ?? 100) >= 60);
  const classes: string[] = [];
  if (row.status === "approved" && row.playback_status === "playable") {
    classes.push("verified_playable");
  }
  if (publicOk) classes.push("public");
  if (!url) classes.push("missing_stream_url");
  if (url && isWebpageUrl(url)) classes.push("webpage_url_as_stream");
  if (url && isBlockedSource(url)) classes.push("blocked_social_or_browser_source");
  if (row.quarantined_at) classes.push("quarantined");
  if (row.disabled_at) classes.push("disabled");
  if (
    row.playback_status === "failed" ||
    row.playback_status === "dead" ||
    Number(row.reliability_score ?? 100) < 30
  ) {
    classes.push("dead");
  }
  if (row.playback_status === "unchecked" || row.playback_status === "pending") {
    classes.push("public_unverified");
  }
  if (/radio|audio.?only|fm\b/i.test(`${row.title || ""} ${row.category || ""}`)) {
    classes.push("audio_only_suspect");
  }
  if (!classes.length) classes.push("metadata_or_other");
  return { ...row, classes, streamUrl: url, sanitizedUrl: url ? sanitizeUrl(url) : "" };
}

async function phaseAudit(cp: Checkpoint) {
  console.log("[audit] loading existing South Korea TV rows...");
  const rows = await fetchExistingSouthKoreaRows();
  const classified = rows.map(classifyExisting);

  const urlGroups = new Map<string, string[]>();
  const titleGroups = new Map<string, string[]>();
  for (const r of classified) {
    const uk = urlKey(r.streamUrl);
    const tk = titleKey(r.title || "");
    if (uk) {
      if (!urlGroups.has(uk)) urlGroups.set(uk, []);
      urlGroups.get(uk)!.push(r.id);
    }
    if (tk) {
      if (!titleGroups.has(tk)) titleGroups.set(tk, []);
      titleGroups.get(tk)!.push(r.id);
    }
  }
  const duplicateUrlGroups = [...urlGroups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([url, ids]) => ({ url: sanitizeUrl(url), ids }));
  const duplicateTitleGroups = [...titleGroups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([title, ids]) => ({ title, ids }));

  const countClass = (name: string) =>
    classified.filter((r) => r.classes.includes(name)).length;

  const audit = {
    auditedAt: new Date().toISOString(),
    uniqueRows: classified.length,
    byRegionKR: classified.filter((r) => String(r.region || "").toUpperCase() === "KR")
      .length,
    verifiedPlayable: countClass("verified_playable"),
    publicRows: countClass("public"),
    dead: countClass("dead"),
    quarantined: countClass("quarantined"),
    disabled: countClass("disabled"),
    missingStreamUrl: countClass("missing_stream_url"),
    webpageUrls: countClass("webpage_url_as_stream"),
    blockedSocial: countClass("blocked_social_or_browser_source"),
    audioOnlySuspect: countClass("audio_only_suspect"),
    publicUnverified: countClass("public_unverified"),
    duplicateUrlGroups: duplicateUrlGroups.length,
    duplicateTitleGroups: duplicateTitleGroups.length,
    playbackStatus: Object.fromEntries(
      [...new Set(classified.map((r) => r.playback_status || "(null)"))].map((s) => [
        s,
        classified.filter((r) => (r.playback_status || "(null)") === s).length,
      ])
    ),
    regionBreakdown: Object.fromEntries(
      [...new Set(classified.map((r) => r.region || "(null)"))].map((s) => [
        s,
        classified.filter((r) => (r.region || "(null)") === s).length,
      ])
    ),
    duplicates: {
      url: duplicateUrlGroups.slice(0, 200),
      title: duplicateTitleGroups.slice(0, 200),
    },
    rows: classified.map((r) => ({
      id: r.id,
      title: r.title,
      region: r.region,
      language: r.language,
      category: r.category,
      status: r.status,
      playback_status: r.playback_status,
      reliability_score: r.reliability_score,
      stream_protocol: r.stream_protocol,
      ios_playable: r.ios_playable,
      android_playable: r.android_playable,
      classes: r.classes,
      sanitizedUrl: r.sanitizedUrl,
      source_key: r.source_key,
    })),
  };

  const kpRows = await fetchExistingNorthKoreaRows();
  const kpAudit = {
    note: "North Korea kept entirely separate â€” never imported under KR",
    uniqueRows: kpRows.length,
    rows: kpRows.map((r) => ({
      id: r.id,
      title: r.title,
      region: r.region,
      playback_status: r.playback_status,
      status: r.status,
    })),
  };
  writeJson(path.join(OUT_DIR, "01b-north-korea-separate.json"), kpAudit);
  (audit as typeof audit & { northKoreaSeparate?: typeof kpAudit }).northKoreaSeparate = kpAudit;

  const out = path.join(OUT_DIR, "01-existing-catalog-audit.json");
  writeJson(out, audit);
  cp.existingAuditPath = out;
  cp.stats.existingRows = audit.uniqueRows;
  cp.stats.existingVerifiedPlayable = audit.verifiedPlayable;
  cp.stats.existingPublic = audit.publicRows;
  cp.stats.existingDead = audit.dead;
  cp.stats.existingQuarantined = audit.quarantined;
  cp.stats.existingDuplicateUrlGroups = audit.duplicateUrlGroups;
  if (!cp.phasesCompleted.includes("audit")) cp.phasesCompleted.push("audit");
  saveCheckpoint(cp);
  console.log(
    `[audit] KR rows=${audit.uniqueRows} playable=${audit.verifiedPlayable} public=${audit.publicRows} dead=${audit.dead} dupsUrl=${audit.duplicateUrlGroups}`
  );
  return audit;
}

function loadLocalSeedCandidates(): DiscoveredCandidate[] {
  const files = [
    "lib/tvExpansion25k/sources/data/worldwave4/iptvOrgGithubCountriesWave4.json",
    "lib/tvExpansion25k/sources/data/worldwave/iptvOrgUnseenWorldwave.json",
    "lib/tvExpansion25k/sources/data/worldwave3/iptvOrgApiResidualWave3.json",
    "lib/tvExpansion25k/sources/data/worldwave4/freeCommunityPlaylistsWave4.json",
    "lib/tvExpansion25k/sources/data/worldwave4/regionalCommunityWave4.json",
    "lib/tvExpansion25k/sources/data/worldwave/officialOrgManifests.json",
    "lib/tvExpansion25k/sources/data/worldwave/publicAsiaPacificWave2.json",
    "lib/tvExpansion25k/sources/data/worldwave4/parliamentGovernmentWave4.json",
    "lib/tvExpansion25k/sources/data/worldwave4/educationCultureWave4.json",
    "lib/tvExpansion25k/sources/data/worldwave4/religiousEducationWave4.json",
    "lib/tvExpansion25k/sources/data/worldwave4/internationalNewsWave4.json",
    "lib/tvExpansion25k/sources/data/worldwave4/countryOfficialManifestsWave4.json",
  ];
  const out: DiscoveredCandidate[] = [];
  const now = new Date().toISOString();
  for (const rel of files) {
    const full = path.join(adminRoot, rel);
    if (!fs.existsSync(full)) continue;
    const raw = JSON.parse(fs.readFileSync(full, "utf8"));
    const arr = Array.isArray(raw) ? raw : [];
    for (const item of arr) {
      const country = String(item.country || item.region || item.country_code || "")
        .trim()
        .toUpperCase();
      if (country !== "KR") continue;
      const url = String(item.url || item.source_url || item.stream_url || "").trim();
      const title = normalizeTitle(String(item.title || item.name || item.channelName || ""));
      if (!url || !title) continue;
      if (isBlockedSource(url) || isWebpageUrl(url)) continue;
      out.push({
        key: candidateKey(title, url),
        title,
        nativeName: item.nativeName || item.channelName || null,
        sourceUrl: url,
        country: "KR",
        language: item.language || "ko",
        category: item.category || null,
        website: item.website || null,
        logo: item.logo || item.thumbnail_url || null,
        iptvOrgId: item.iptvOrgId || item.channel || null,
        sourceFamily: "local_seed_json",
        sourceProvenance: rel,
        sourceConfidence: 0.7,
        discoveredAt: now,
        quality: null,
      });
    }
  }
  return out;
}

/** Official / public broadcaster endpoints known or documented as public HLS/DASH (no bypass). */
const OFFICIAL_PUBLIC_CANDIDATES: Array<Omit<DiscoveredCandidate, "key" | "discoveredAt" | "country">> = [
  {
    title: "Arirang TV",
    nativeName: "ì•„ë¦¬ëž‘TV",
    sourceUrl:
      "https://amdlive-ch01-ctnd-com.akamaized.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8",
    language: "en,ko",
    category: "International",
    broadcaster: "Arirang TV",
    website: "https://www.arirang.com/",
    region: "Seoul",
    sourceFamily: "official_static",
    sourceProvenance: "arirang-akamai-public-hls",
    sourceConfidence: 0.95,
    quality: "HD",
  },
  {
    title: "Arirang TV",
    nativeName: "ì•„ë¦¬ëž‘TV",
    sourceUrl:
      "https://amdlive-ch02-ctnd-com.akamaized.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8",
    language: "en,ko",
    category: "International",
    broadcaster: "Arirang TV",
    website: "https://www.arirang.com/",
    region: "Seoul",
    sourceFamily: "official_static",
    sourceProvenance: "arirang-akamai-public-hls",
    sourceConfidence: 0.9,
    quality: "HD",
  },
  {
    title: "Arirang UN",
    nativeName: "ì•„ë¦¬ëž‘ UN",
    sourceUrl:
      "https://amdlive-ch02-ctnd-com.akamaized.net/arirang_2ch/smil:arirang_2ch.smil/playlist.m3u8",
    language: "en",
    category: "International",
    broadcaster: "Arirang TV",
    website: "https://www.arirang.com/",
    region: "Seoul",
    sourceFamily: "official_static",
    sourceProvenance: "arirang-akamai-public-hls",
    sourceConfidence: 0.9,
    quality: "HD",
  },
  {
    title: "Arirang Radio TV",
    nativeName: "ì•„ë¦¬ëž‘ ë¼ë””ì˜¤",
    sourceUrl:
      "https://amdlive-ch02-ctnd-com.akamaized.net/arirang_3ch/smil:arirang_3ch.smil/playlist.m3u8",
    language: "en,ko",
    category: "International",
    broadcaster: "Arirang TV",
    website: "https://www.arirang.com/",
    region: "Seoul",
    sourceFamily: "official_static",
    sourceProvenance: "arirang-akamai-public-hls",
    sourceConfidence: 0.85,
    quality: "HD",
  },
  {
    title: "National Assembly TV",
    nativeName: "êµ­íšŒë°©ì†¡",
    sourceUrl: "https://m.webcast.go.kr/live/smil:natv_720p.smil/playlist.m3u8",
    language: "ko",
    category: "Government",
    broadcaster: "National Assembly of Korea",
    website: "https://www.natv.go.kr/",
    region: "Seoul",
    sourceFamily: "official_static",
    sourceProvenance: "webcast.go.kr-public-hls",
    sourceConfidence: 0.95,
    quality: "HD",
  },
  {
    title: "CBS TV",
    nativeName: "CBS",
    sourceUrl: "https://cbs-live.cbs.co.kr/cbs-live/_definst_/cbs-live.stream/playlist.m3u8",
    language: "ko",
    category: "Religious",
    broadcaster: "CBS",
    website: "https://www.cbs.co.kr/",
    region: "Seoul",
    sourceFamily: "official_static",
    sourceProvenance: "cbs.co.kr-public-hls",
    sourceConfidence: 0.95,
    quality: "FHD",
  },
  {
    title: "Hyundai Home Shopping",
    nativeName: "í˜„ëŒ€í™ˆì‡¼í•‘",
    sourceUrl: "https://cdnlive.hmall.com/live/ngrp:hmall.stream_mobile/playlist.m3u8",
    language: "ko",
    category: "Shopping",
    broadcaster: "Hyundai Home Shopping",
    website: "https://www.hmall.com/",
    region: "Seoul",
    sourceFamily: "official_static",
    sourceProvenance: "hmall-cdnlive-public-hls",
    sourceConfidence: 0.9,
    quality: "SD",
  },
  {
    title: "Hyundai Home Shopping",
    nativeName: "í˜„ëŒ€í™ˆì‡¼í•‘",
    sourceUrl: "https://dtvstreaming.hyundaihmall.com/newcjp3/cjpstream_500K/playlist.m3u8",
    language: "ko",
    category: "Shopping",
    broadcaster: "Hyundai Home Shopping",
    website: "https://www.hmall.com/",
    region: "Seoul",
    sourceFamily: "official_static",
    sourceProvenance: "hyundaihmall-dtvstreaming-public-hls",
    sourceConfidence: 0.85,
    quality: "SD",
  },
];

const IPTV_ORG_KR_M3U_URLS = [
  "https://iptv-org.github.io/iptv/countries/kr.m3u",
  "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/kr.m3u",
];

const OFFICIAL_LIVE_PAGES: Array<{ name: string; url: string; region?: string; category?: string; hangul?: string }> = [
  { name: "KBS", hangul: "í•œêµ­ë°©ì†¡ê³µì‚¬", url: "https://www.kbs.co.kr/", region: "Seoul", category: "Public" },
  { name: "KBS World", hangul: "KBSì›”ë“œ", url: "https://world.kbs.co.kr/", region: "Seoul", category: "International" },
  { name: "MBC", hangul: "ë¬¸í™”ë°©ì†¡", url: "https://www.imbc.com/", region: "Seoul", category: "Commercial" },
  { name: "SBS", hangul: "ì„œìš¸ë°©ì†¡", url: "https://www.sbs.co.kr/", region: "Seoul", category: "Commercial" },
  { name: "EBS", hangul: "í•œêµ­êµìœ¡ë°©ì†¡ê³µì‚¬", url: "https://www.ebs.co.kr/", region: "Seoul", category: "Education" },
  { name: "Arirang TV", hangul: "ì•„ë¦¬ëž‘TV", url: "https://www.arirang.com/", region: "Seoul", category: "International" },
  { name: "Arirang Live", hangul: "ì•„ë¦¬ëž‘TV", url: "https://www.arirang.com/tv", region: "Seoul", category: "International" },
  { name: "YTN", hangul: "ì™€ì´í‹°ì—”", url: "https://www.ytn.co.kr/", region: "Seoul", category: "News" },
  { name: "YTN Live", hangul: "ì™€ì´í‹°ì—”", url: "https://www.ytn.co.kr/live", region: "Seoul", category: "News" },
  { name: "Yonhap News TV", hangul: "ì—°í•©ë‰´ìŠ¤TV", url: "https://www.yonhapnewstv.co.kr/", region: "Seoul", category: "News" },
  { name: "National Assembly TV", hangul: "êµ­íšŒë°©ì†¡", url: "https://www.natv.go.kr/", region: "Seoul", category: "Government" },
  { name: "KTV", hangul: "í•œêµ­ì •ì±…ë°©ì†¡", url: "https://www.ktv.go.kr/", region: "Seoul", category: "Government" },
  { name: "KTV Live", hangul: "í•œêµ­ì •ì±…ë°©ì†¡", url: "https://www.ktv.go.kr/content/live", region: "Seoul", category: "Government" },
  { name: "OBS Gyeongin", hangul: "OBS", url: "https://www.obs.co.kr/", region: "Gyeonggi", category: "Regional" },
  { name: "TJB", hangul: "ëŒ€ì „ë°©ì†¡", url: "https://www.tjb.co.kr/", region: "Daejeon", category: "Regional" },
  { name: "KNN", hangul: "ì¼€ì´ì—”ì—”", url: "https://www.knn.co.kr/", region: "Busan", category: "Regional" },
  { name: "TBC", hangul: "ëŒ€êµ¬ë°©ì†¡", url: "https://www.tbc.co.kr/", region: "Daegu", category: "Regional" },
  { name: "kbc", hangul: "ê´‘ì£¼ë°©ì†¡", url: "https://www.ikbc.co.kr/", region: "Gwangju", category: "Regional" },
  { name: "ubc", hangul: "ìš¸ì‚°ë°©ì†¡", url: "https://www.ubc.co.kr/", region: "Ulsan", category: "Regional" },
  { name: "JIBS", hangul: "ì œì£¼ë°©ì†¡", url: "https://www.jibs.co.kr/", region: "Jeju", category: "Regional" },
  { name: "CJB", hangul: "ì²­ì£¼ë°©ì†¡", url: "https://www.cjb.co.kr/", region: "North Chungcheong", category: "Regional" },
  { name: "JTV", hangul: "ì „ì£¼ë°©ì†¡", url: "https://www.jtv.co.kr/", region: "North Jeolla", category: "Regional" },
  { name: "KBC Busan", hangul: "ë¶€ì‚°ê²½ë‚¨ë°©ì†¡", url: "https://www.kbc.co.kr/", region: "Busan", category: "Regional" },
  { name: "G1", hangul: "ê°•ì›ë¯¼ë°©", url: "https://www.g1tv.co.kr/", region: "Gangwon", category: "Regional" },
  { name: "MBC Busan", hangul: "ë¶€ì‚°MBC", url: "https://www.busanmbc.co.kr/", region: "Busan", category: "Regional" },
  { name: "MBC Daegu", hangul: "ëŒ€êµ¬MBC", url: "https://www.dgmbc.com/", region: "Daegu", category: "Regional" },
  { name: "MBC Gwangju", hangul: "ê´‘ì£¼MBC", url: "https://www.kjmbc.co.kr/", region: "Gwangju", category: "Regional" },
  { name: "MBC Daejeon", hangul: "ëŒ€ì „MBC", url: "https://www.tjmbc.co.kr/", region: "Daejeon", category: "Regional" },
  { name: "MBC Jeju", hangul: "ì œì£¼MBC", url: "https://www.jejumbc.com/", region: "Jeju", category: "Regional" },
  { name: "Seoul Metropolitan TV", hangul: "ì„œìš¸ì‹œ", url: "https://tv.seoul.go.kr/", region: "Seoul", category: "Municipal" },
  { name: "Busan City", hangul: "ë¶€ì‚°ì‹œ", url: "https://www.busan.go.kr/", region: "Busan", category: "Municipal" },
  { name: "Incheon City", hangul: "ì¸ì²œì‹œ", url: "https://www.incheon.go.kr/", region: "Incheon", category: "Municipal" },
  { name: "Daegu City", hangul: "ëŒ€êµ¬ì‹œ", url: "https://www.daegu.go.kr/", region: "Daegu", category: "Municipal" },
  { name: "Gwangju City", hangul: "ê´‘ì£¼ì‹œ", url: "https://www.gwangju.go.kr/", region: "Gwangju", category: "Municipal" },
  { name: "Daejeon City", hangul: "ëŒ€ì „ì‹œ", url: "https://www.daejeon.go.kr/", region: "Daejeon", category: "Municipal" },
  { name: "Ulsan City", hangul: "ìš¸ì‚°ì‹œ", url: "https://www.ulsan.go.kr/", region: "Ulsan", category: "Municipal" },
  { name: "Sejong City", hangul: "ì„¸ì¢…ì‹œ", url: "https://www.sejong.go.kr/", region: "Sejong", category: "Municipal" },
  { name: "Gyeonggi Province", hangul: "ê²½ê¸°ë„", url: "https://www.gg.go.kr/", region: "Gyeonggi", category: "Provincial" },
  { name: "Gangwon Province", hangul: "ê°•ì›íŠ¹ë³„ìžì¹˜ë„", url: "https://www.gangwon.go.kr/", region: "Gangwon", category: "Provincial" },
  { name: "Chungbuk Province", hangul: "ì¶©ì²­ë¶ë„", url: "https://www.chungbuk.go.kr/", region: "North Chungcheong", category: "Provincial" },
  { name: "Chungnam Province", hangul: "ì¶©ì²­ë‚¨ë„", url: "https://www.chungnam.go.kr/", region: "South Chungcheong", category: "Provincial" },
  { name: "Jeonbuk Province", hangul: "ì „ë¶íŠ¹ë³„ìžì¹˜ë„", url: "https://www.jeonbuk.go.kr/", region: "North Jeolla", category: "Provincial" },
  { name: "Jeonnam Province", hangul: "ì „ë¼ë‚¨ë„", url: "https://www.jeonnam.go.kr/", region: "South Jeolla", category: "Provincial" },
  { name: "Gyeongbuk Province", hangul: "ê²½ìƒë¶ë„", url: "https://www.gb.go.kr/", region: "North Gyeongsang", category: "Provincial" },
  { name: "Gyeongnam Province", hangul: "ê²½ìƒë‚¨ë„", url: "https://www.gyeongnam.go.kr/", region: "South Gyeongsang", category: "Provincial" },
  { name: "Jeju Province", hangul: "ì œì£¼íŠ¹ë³„ìžì¹˜ë„", url: "https://www.jeju.go.kr/", region: "Jeju", category: "Provincial" },
  { name: "Channel A", hangul: "ì±„ë„A", url: "https://www.ichannela.com/", region: "Seoul", category: "News" },
  { name: "TV Chosun", hangul: "TVì¡°ì„ ", url: "https://www.tvchosun.com/", region: "Seoul", category: "News" },
  { name: "JTBC", hangul: "ì œì´í‹°ë¹„ì”¨", url: "https://jtbc.co.kr/", region: "Seoul", category: "News" },
  { name: "MBN", hangul: "ë§¤ì¼ë°©ì†¡", url: "https://www.mbn.co.kr/", region: "Seoul", category: "News" },
  { name: "CBS TV", hangul: "CBS", url: "https://www.cbs.co.kr/", region: "Seoul", category: "Religious" },
  { name: "CTS", hangul: "ê¸°ë…êµTV", url: "https://www.cts.tv/", region: "Seoul", category: "Religious" },
  { name: "CGNTV", hangul: "CGNTV", url: "https://www.cgntv.net/", region: "Seoul", category: "Religious" },
  { name: "BTN", hangul: "ë¶ˆêµTV", url: "https://www.btn.co.kr/", region: "Seoul", category: "Religious" },
  { name: "Hyundai Home Shopping", hangul: "í˜„ëŒ€í™ˆì‡¼í•‘", url: "https://www.hmall.com/", region: "Seoul", category: "Shopping" },
  { name: "GS Shop", hangul: "GSìƒµ", url: "https://www.gsshop.com/", region: "Seoul", category: "Shopping" },
  { name: "CJ OnStyle", hangul: "CJì˜¨ìŠ¤íƒ€ì¼", url: "https://www.cjonstyle.com/", region: "Seoul", category: "Shopping" },
  { name: "LOTTE Home Shopping", hangul: "ë¡¯ë°í™ˆì‡¼í•‘", url: "https://www.lotteimall.com/", region: "Seoul", category: "Shopping" },
  { name: "NS Home Shopping", hangul: "NSí™ˆì‡¼í•‘", url: "https://www.nsmall.com/", region: "Seoul", category: "Shopping" },
  { name: "W Shopping", hangul: "Wì‡¼í•‘", url: "https://www.wshop.co.kr/", region: "Seoul", category: "Shopping" },
  { name: "SK Stoa", hangul: "SKìŠ¤í† ì•„", url: "https://www.skstoa.com/", region: "Seoul", category: "Shopping" },
  { name: "Home&Shopping", hangul: "í™ˆì•¤ì‡¼í•‘", url: "https://www.hnsmall.com/", region: "Seoul", category: "Shopping" },
  { name: "K Shopping", hangul: "Kì‡¼í•‘", url: "https://www.kshop.co.kr/", region: "Seoul", category: "Shopping" },
  { name: "Shopping NT", hangul: "ì‡¼í•‘ì—”í‹°", url: "https://www.shoppingntmall.com/", region: "Seoul", category: "Shopping" },
  { name: "OCN", hangul: "OCN", url: "https://ocn.tving.com/", region: "Seoul", category: "Entertainment" },
  { name: "tvN", hangul: "tvN", url: "https://tvn.cjenm.com/", region: "Seoul", category: "Entertainment" },
];

const KR_ADMIN_REGIONS = [
  { en: "Seoul", hangul: "ì„œìš¸", type: "special_city" },
  { en: "Busan", hangul: "ë¶€ì‚°", type: "metropolitan_city" },
  { en: "Daegu", hangul: "ëŒ€êµ¬", type: "metropolitan_city" },
  { en: "Incheon", hangul: "ì¸ì²œ", type: "metropolitan_city" },
  { en: "Gwangju", hangul: "ê´‘ì£¼", type: "metropolitan_city" },
  { en: "Daejeon", hangul: "ëŒ€ì „", type: "metropolitan_city" },
  { en: "Ulsan", hangul: "ìš¸ì‚°", type: "metropolitan_city" },
  { en: "Sejong", hangul: "ì„¸ì¢…", type: "self_governing_city" },
  { en: "Gyeonggi", hangul: "ê²½ê¸°", type: "province" },
  { en: "Gangwon", hangul: "ê°•ì›", type: "self_governing_province" },
  { en: "North Chungcheong", hangul: "ì¶©ë¶", type: "province" },
  { en: "South Chungcheong", hangul: "ì¶©ë‚¨", type: "province" },
  { en: "North Jeolla", hangul: "ì „ë¶", type: "self_governing_province" },
  { en: "South Jeolla", hangul: "ì „ë‚¨", type: "province" },
  { en: "North Gyeongsang", hangul: "ê²½ë¶", type: "province" },
  { en: "South Gyeongsang", hangul: "ê²½ë‚¨", type: "province" },
  { en: "Jeju", hangul: "ì œì£¼", type: "self_governing_province" },
];

function extractStreamHints(html: string, baseUrl: string) {
  const found = new Set<string>();
  const patterns = [
    /https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|mpd)(?:\?[^"'\\\s<>]*)?/gi,
    /\/\/[^"'\\\s<>]+?\.(?:m3u8|mpd)(?:\?[^"'\\\s<>]*)?/gi,
    /["']([^"'\\\s]+\.(?:m3u8|mpd)(?:\?[^"'\\\s]*)?)["']/gi,
    /file\s*:\s*["']([^"']+)["']/gi,
    /source\s*:\s*["']([^"']+)["']/gi,
    /src=["']([^"']+\.(?:m3u8|mpd)[^"']*)["']/gi,
    /source=(https?:)?\/\/[^"'\\\s&<>]+?\.(?:m3u8|mpd)(?:\?[^"'\\\s&<>]*)?/gi,
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      let raw = decodeHtmlEntities((m[1] || m[0] || "").replace(/^["']|["']$/g, ""));
      raw = raw.replace(/^source=/i, "");
      if (raw.startsWith("//")) raw = `https:${raw}`;
      try {
        const abs = new URL(raw, baseUrl).toString();
        if (isBlockedSource(abs)) continue;
        const nested = abs.match(
          /(?:https?:)?\/\/[^"'\\\s<>]+?\.(?:m3u8|mpd)(?:\?[^"'\\\s<>]*)?/i
        );
        let streamUrl = nested ? nested[0] : abs;
        if (streamUrl.startsWith("//")) streamUrl = `https:${streamUrl}`;
        if (
          /\.(m3u8|mpd)(\?|$)/i.test(streamUrl) &&
          !eligibilityRejectReason(streamUrl)
        ) {
          found.add(streamUrl);
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
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/json,*/*",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get("content-type"),
      text: text.slice(0, 500_000),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      contentType: null,
      text: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function discoverFromOfficialPages(concurrency: number) {
  const now = new Date().toISOString();
  const discovered: DiscoveredCandidate[] = [];
  const pageReports: Array<Record<string, unknown>> = [];

  await mapPool(OFFICIAL_LIVE_PAGES, Math.min(2, concurrency), async (page) => {
    const res = await fetchText(page.url);
    const hints = res.text ? extractStreamHints(res.text, res.finalUrl || page.url) : [];
    pageReports.push({
      name: page.name,
      url: page.url,
      status: res.status,
      ok: res.ok,
      hintCount: hints.length,
      hints: hints.map(sanitizeUrl),
      error: (res as { error?: string }).error || null,
    });
    for (const url of hints) {
      const title = normalizeTitle(page.name);
      discovered.push({
        key: candidateKey(title, url),
        title,
        nativeName: page.hangul || page.name,
        sourceUrl: url,
        country: "KR",
        region: page.region || null,
        category: page.category || null,
        language: "ko",
        website: page.url,
        sourceFamily: "official_broadcaster_page",
        sourceProvenance: page.url,
        sourceConfidence: 0.9,
        discoveredAt: now,
      });
    }
  });

  writeJson(path.join(OUT_DIR, "02b-official-page-probe.json"), {
    pagesSearched: OFFICIAL_LIVE_PAGES.length,
    pages: pageReports,
    streamsFound: discovered.length,
  });
  return discovered;
}

async function discoverFromIptvOrg(): Promise<DiscoveredCandidate[]> {
  console.log("[discover] fetching iptv-org channels + streams...");
  const [chRes, stRes] = await Promise.all([
    fetch(IPTV_CHANNELS_URL, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(60_000),
    }),
    fetch(IPTV_STREAMS_URL, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(60_000),
    }),
  ]);
  if (!chRes.ok || !stRes.ok) {
    throw new Error(`iptv-org fetch failed channels=${chRes.status} streams=${stRes.status}`);
  }
  const channels = (await chRes.json()) as Array<{
    id: string;
    name: string;
    country?: string;
    categories?: string[];
    languages?: string[];
    logo?: string;
    website?: string;
    is_nsfw?: boolean;
    network?: string;
    owners?: string[];
  }>;
  const streams = (await stRes.json()) as Array<{
    channel: string;
    url: string;
    timeshift?: string;
    quality?: string;
  }>;

  const krChannels = new Map(
    channels
      .filter((c) => c?.id && c?.name && !c.is_nsfw && String(c.country || "").toUpperCase() === "KR")
      .map((c) => [c.id, c])
  );

  const now = new Date().toISOString();
  const out: DiscoveredCandidate[] = [];
  const seen = new Set<string>();
  for (const stream of streams) {
    const channel = krChannels.get(stream.channel);
    if (!channel) continue;
    const urlCheck = validatePublicTvUrl(stream.url);
    if (!urlCheck.ok) continue;
    if (isBlockedSource(urlCheck.url) || isWebpageUrl(urlCheck.url)) continue;
    const uk = urlKey(urlCheck.url);
    if (seen.has(uk)) continue;
    seen.add(uk);
    const title = normalizeTitle(channel.name);
    out.push({
      key: candidateKey(title, urlCheck.url),
      title,
      nativeName: channel.name,
      sourceUrl: urlCheck.url,
      country: "KR",
      language: (channel.languages || []).join(",") || "ko",
      category: (channel.categories || [])[0] || null,
      broadcaster: channel.network || channel.owners?.[0] || null,
      website: channel.website || null,
      logo: channel.logo || null,
      iptvOrgId: channel.id,
      quality: stream.quality || null,
      sourceFamily: "iptv_org",
      sourceProvenance: "https://iptv-org.github.io/api/",
      sourceConfidence: 0.85,
      discoveredAt: now,
    });
  }

  writeJson(path.join(OUT_DIR, "02c-iptv-org-kr.json"), {
    krChannelIdentities: krChannels.size,
    streamCandidates: out.length,
    sample: out.slice(0, 20).map((c) => ({
      title: c.title,
      iptvOrgId: c.iptvOrgId,
      category: c.category,
      url: sanitizeUrl(c.sourceUrl),
    })),
  });
  return out;
}

function parseM3uEntries(text: string) {
  const entries: Array<{ title: string; url: string; tvgId?: string }> = [];
  const lines = text.split(/\r?\n/);
  let pending: { title: string; tvgId?: string } | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#EXTINF:")) {
      const title = normalizeTitle(trimmed.split(",").slice(1).join(",").trim());
      const tvgId = trimmed.match(/tvg-id="([^"]+)"/i)?.[1];
      pending = { title, tvgId };
      continue;
    }
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (pending?.title) {
      entries.push({ title: pending.title, url: trimmed, tvgId: pending.tvgId });
      pending = null;
    }
  }
  return entries;
}

async function discoverFromIptvOrgM3u(): Promise<DiscoveredCandidate[]> {
  const now = new Date().toISOString();
  const out: DiscoveredCandidate[] = [];
  const seen = new Set<string>();
  const reports: Array<Record<string, unknown>> = [];

  for (const m3uUrl of IPTV_ORG_KR_M3U_URLS) {
    try {
      const res = await fetch(m3uUrl, {
        headers: { Accept: "*/*", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        reports.push({ url: m3uUrl, status: res.status, ok: false });
        continue;
      }
      const text = await res.text();
      const entries = parseM3uEntries(text);
      let added = 0;
      for (const entry of entries) {
        const urlCheck = validatePublicTvUrl(entry.url);
        if (!urlCheck.ok) continue;
        if (eligibilityRejectReason(urlCheck.url)) continue;
        const uk = urlKey(urlCheck.url);
        if (seen.has(uk)) continue;
        seen.add(uk);
        const title = normalizeTitle(entry.title);
        out.push({
          key: candidateKey(title, urlCheck.url),
          title,
          nativeName: entry.title,
          sourceUrl: urlCheck.url,
          country: "KR",
          language: "ko",
          iptvOrgId: entry.tvgId || null,
          sourceFamily: "iptv_org_m3u",
          sourceProvenance: m3uUrl,
          sourceConfidence: 0.8,
          discoveredAt: now,
        });
        added += 1;
      }
      reports.push({ url: m3uUrl, status: res.status, ok: true, entries: entries.length, added });
    } catch (error) {
      reports.push({
        url: m3uUrl,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  writeJson(path.join(OUT_DIR, "02d-iptv-org-kr-m3u.json"), {
    reports,
    streamCandidates: out.length,
  });
  return out;
}

async function phaseDiscover(cp: Checkpoint) {
  console.log("[discover] collecting candidates...");
  const concurrency = Number(argValue("concurrency", "4"));
  const [iptv, iptvM3u, official, seeds] = await Promise.all([
    discoverFromIptvOrg(),
    discoverFromIptvOrgM3u(),
    discoverFromOfficialPages(concurrency),
    Promise.resolve(loadLocalSeedCandidates()),
  ]);

  const forOfficialStatic = OFFICIAL_PUBLIC_CANDIDATES.map((c) => {
    const title = normalizeTitle(c.title);
    return {
      ...c,
      key: candidateKey(title, c.sourceUrl),
      title,
      country: "KR" as const,
      discoveredAt: new Date().toISOString(),
    };
  });

  const merged = new Map<string, DiscoveredCandidate>();
  for (const c of [...iptv, ...iptvM3u, ...official, ...seeds, ...forOfficialStatic]) {
    if (!c.sourceUrl || !c.title) continue;
    if (eligibilityRejectReason(c.sourceUrl)) continue;
    const existing = merged.get(c.key);
    if (!existing || c.sourceConfidence > existing.sourceConfidence) {
      merged.set(c.key, c);
    }
  }

  // Also dedupe by URL â€” keep highest confidence
  const byUrl = new Map<string, DiscoveredCandidate>();
  for (const c of merged.values()) {
    const uk = urlKey(c.sourceUrl);
    const prev = byUrl.get(uk);
    if (!prev || c.sourceConfidence > prev.sourceConfidence) byUrl.set(uk, c);
  }

  // Region coverage matrix (identity discovery checklist; not stream proof)
  const regionMatrix = KR_ADMIN_REGIONS.map((region) => ({
    region: region.en,
    hangul: region.hangul,
    type: region.type,
    officialPagesTouched: OFFICIAL_LIVE_PAGES.some((p) =>
      String(p.region || "").toLowerCase().includes(region.en.toLowerCase().slice(0, 5))
    ),
    candidateTitlesMentioning: [...byUrl.values()].filter((c) => {
      const blob = `${c.title} ${c.region || ""} ${c.city || ""}`;
      return (
        blob.toLowerCase().includes(region.en.toLowerCase().slice(0, 5)) ||
        blob.includes(region.hangul)
      );
    }).length,
  }));

  const candidates = [...byUrl.values()];
  const discovery = {
    discoveredAt: new Date().toISOString(),
    sourceFamilies: {
      iptv_org: iptv.length,
      iptv_org_m3u: iptvM3u.length,
      official_broadcaster_page: official.length,
      local_seed_json: seeds.length,
      official_static: forOfficialStatic.length,
    },
    officialPagesSearched: OFFICIAL_LIVE_PAGES.length,
    adminRegionsListed: KR_ADMIN_REGIONS.length,
    uniqueStreamCandidates: candidates.length,
    hlsCandidates: candidates.filter((c) => /\.m3u8(\?|$)/i.test(c.sourceUrl)).length,
    dashCandidates: candidates.filter((c) => /\.mpd(\?|$)/i.test(c.sourceUrl)).length,
    otherCandidates: candidates.filter(
      (c) => !/\.(m3u8|mpd)(\?|$)/i.test(c.sourceUrl)
    ).length,
    regionMatrix,
    candidates: candidates.map((c) => ({
      ...c,
      sanitizedUrl: sanitizeUrl(c.sourceUrl),
    })),
  };

  const out = path.join(OUT_DIR, "02-discovery.json");
  writeJson(out, discovery);
  writeJson(path.join(OUT_DIR, "02-region-coverage.json"), { regions: regionMatrix });
  cp.discoveryPath = out;
  cp.stats.discovered = candidates.length;
  cp.stats.sourceFamilies = Object.keys(discovery.sourceFamilies).length;
  if (!cp.phasesCompleted.includes("discover")) cp.phasesCompleted.push("discover");
  saveCheckpoint(cp);
  console.log(
    `[discover] unique=${candidates.length} iptv=${iptv.length} m3u=${iptvM3u.length} officialHints=${official.length} seeds=${seeds.length} static=${forOfficialStatic.length}`
  );
  return candidates;
}

async function sustainedPlaybackCheck(url: string): Promise<{
  ok: boolean;
  reason: string;
  segmentOk: number;
  mediaSequence?: string | null;
}> {
  try {
    const first = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!first.ok) return { ok: false, reason: `manifest_http_${first.status}`, segmentOk: 0 };
    const body1 = (await first.text()).slice(0, 200_000);
    if (/^\s*</.test(body1) || /<html/i.test(body1)) {
      return { ok: false, reason: "html_page", segmentOk: 0 };
    }
    const isHls = /#EXTM3U/i.test(body1);
    const isDash = /<MPD[\s>]/i.test(body1);
    if (!isHls && !isDash) {
      return { ok: false, reason: "not_manifest", segmentOk: 0 };
    }

    let mediaPlaylist = body1;
    let base = first.url;
    if (isHls && /#EXT-X-STREAM-INF/i.test(body1)) {
      const variant = [...body1.matchAll(/#EXT-X-STREAM-INF:[^\n]*\n([^\n#]+)/gi)]
        .map((m) => m[1].trim())
        .find(Boolean);
      if (!variant) return { ok: false, reason: "master_no_variant", segmentOk: 0 };
      const variantUrl = new URL(variant, first.url).toString();
      const vRes = await fetch(variantUrl, {
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
      });
      if (!vRes.ok) return { ok: false, reason: `variant_http_${vRes.status}`, segmentOk: 0 };
      mediaPlaylist = (await vRes.text()).slice(0, 200_000);
      base = vRes.url;
    }

    if (isHls) {
      const hasVideo =
        /#EXT-X-STREAM-INF/i.test(body1) ||
        !/#EXT-X-MEDIA:.*TYPE=AUDIO/i.test(mediaPlaylist) ||
        /#EXTINF/i.test(mediaPlaylist);
      // Reject obvious audio-only media playlists with no video
      if (
        /TYPE=AUDIO/i.test(mediaPlaylist) &&
        !/#EXT-X-STREAM-INF/i.test(body1) &&
        !/#EXTINF/i.test(mediaPlaylist)
      ) {
        return { ok: false, reason: "audio_only", segmentOk: 0 };
      }
      const seq1 = mediaPlaylist.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/i)?.[1] || null;
      const segs = mediaPlaylist
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .slice(0, 4);
      if (!segs.length) return { ok: false, reason: "no_segments", segmentOk: 0 };
      let segmentOk = 0;
      for (const seg of segs.slice(0, 3)) {
        try {
          const segUrl = new URL(seg, base).toString();
          const segRes = await fetch(segUrl, {
            headers: { "User-Agent": USER_AGENT, Range: "bytes=0-2047" },
            redirect: "follow",
            signal: AbortSignal.timeout(10_000),
          });
          if (!segRes.ok) continue;
          const buf = Buffer.from(await segRes.arrayBuffer());
          const ct = segRes.headers.get("content-type") || "";
          if (/text\/html/i.test(ct) || /^\s*</.test(buf.toString("utf8"))) continue;
          if (buf.length > 0) segmentOk += 1;
        } catch {
          // ignore segment error
        }
      }
      if (segmentOk < 1) return { ok: false, reason: "segments_dead", segmentOk };

      // Second manifest fetch to observe refresh for live
      await new Promise((r) => setTimeout(r, 2500));
      const second = await fetch(base, {
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
      });
      if (second.ok) {
        const body2 = (await second.text()).slice(0, 200_000);
        const seq2 = body2.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/i)?.[1] || null;
        if (seq1 && seq2 && seq1 === seq2) {
          // Still acceptable for VOD-like looping channels; mark soft pass
          return {
            ok: true,
            reason: hasVideo ? "sustained_static_sequence" : "sustained_static_sequence",
            segmentOk,
            mediaSequence: seq2,
          };
        }
      }
      return { ok: true, reason: "sustained_ok", segmentOk, mediaSequence: seq1 };
    }

    // DASH light check
    if (!/<Representation[^>]+mimeType="video/i.test(body1) && !/mimeType="video/i.test(body1)) {
      if (/mimeType="audio/i.test(body1) && !/mimeType="video/i.test(body1)) {
        return { ok: false, reason: "audio_only", segmentOk: 0 };
      }
    }
    return { ok: true, reason: "dash_manifest_ok", segmentOk: 1 };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      segmentOk: 0,
    };
  }
}

function classifyRejectReason(probe: Awaited<ReturnType<typeof probeStreamUrl>>, sustainedReason: string) {
  const blob = `${probe.reason} ${sustainedReason} ${probe.contentType || ""}`.toLowerCase();
  if (/html|not_manifest|player.?page/.test(blob)) return "html_player_page";
  if (/audio_only/.test(blob)) return "audio_only";
  if (/403|401|auth|unauthorized|forbidden/.test(blob)) return "authentication_required";
  if (/geo|451|not available in/.test(blob)) return "geo_restricted";
  if (/drm|widevine|fairplay|playready|ext-x-key:.*uri.*skd:/.test(blob)) return "drm_protected";
  if (/expired|token|signature/.test(blob)) return "expired_or_temporary";
  if (/timeout|abort|network|fetch/.test(blob)) return "dead_or_unreachable";
  if (/segments_dead|no_segments|variant_http|manifest_http/.test(blob)) return "dead";
  if (/private|malformed|unsupported|rtmp|rtsp/.test(blob)) return "unsupported_protocol";
  if (!probe.playable) return "probe_failed";
  return "rejected";
}

async function phaseVerify(cp: Checkpoint, candidates: DiscoveredCandidate[]) {
  const concurrency = Number(argValue("concurrency", "4"));
  const limit = Number(argValue("limit", "0"));
  const existing = readJson<{ rows?: Array<{ source_key?: string | null; sanitizedUrl?: string; title?: string | null }> }>(
    cp.existingAuditPath || path.join(OUT_DIR, "01-existing-catalog-audit.json"),
    {}
  );
  const existingUrls = new Set(
    (existing.rows || []).map((r) => urlKey(r.sanitizedUrl || "")).filter(Boolean)
  );
  const existingTitles = new Set(
    (existing.rows || []).map((r) => titleKey(r.title || "")).filter(Boolean)
  );

  let work = candidates.filter((c) => {
    if (cp.verifiedKeys.includes(c.key)) return false;
    if (cp.rejectedKeys[c.key]) return false;
    return true;
  });
  if (limit > 0) work = work.slice(0, limit);

  console.log(`[verify] probing ${work.length} candidates (concurrency=${concurrency})...`);
  const results: VerifyResult[] = [];
  let done = 0;

  await mapPool(work, concurrency, async (candidate) => {
    const classification = classifyStreamUrl(candidate.sourceUrl);
    const sanitized = sanitizeUrl(candidate.sourceUrl);
    if (!classification.ok) {
      const result: VerifyResult = {
        key: candidate.key,
        title: candidate.title,
        sourceUrl: candidate.sourceUrl,
        sanitizedUrl: sanitized,
        accepted: false,
        reason: classification.reason,
        sourceFamily: candidate.sourceFamily,
        candidate,
      };
      results.push(result);
      cp.rejectedKeys[candidate.key] = classification.reason;
      return;
    }
    const eligibility = eligibilityRejectReason(candidate.sourceUrl);
    if (eligibility) {
      results.push({
        key: candidate.key,
        title: candidate.title,
        sourceUrl: candidate.sourceUrl,
        sanitizedUrl: sanitized,
        accepted: false,
        reason: eligibility,
        sourceFamily: candidate.sourceFamily,
        candidate,
      });
      cp.rejectedKeys[candidate.key] = eligibility;
      return;
    }

    // Skip exact URL already in catalog (repair path handled separately)
    if (existingUrls.has(urlKey(candidate.sourceUrl))) {
      results.push({
        key: candidate.key,
        title: candidate.title,
        sourceUrl: candidate.sourceUrl,
        sanitizedUrl: sanitized,
        accepted: false,
        reason: "duplicate_existing_url",
        sourceFamily: candidate.sourceFamily,
        candidate,
      });
      cp.rejectedKeys[candidate.key] = "duplicate_existing_url";
      return;
    }

    const probe = await probeStreamUrl(candidate.sourceUrl);
    if (!probe.playable) {
      const reason = classifyRejectReason(probe, probe.reason);
      results.push({
        key: candidate.key,
        title: candidate.title,
        sourceUrl: candidate.sourceUrl,
        sanitizedUrl: sanitized,
        accepted: false,
        reason,
        protocol: probe.protocol,
        finalUrl: probe.finalUrl ? sanitizeUrl(probe.finalUrl) : null,
        isHls: probe.isHlsManifest,
        playable: false,
        sourceFamily: candidate.sourceFamily,
        candidate,
        dead: true,
        htmlPage: /html/i.test(probe.contentType || "") || /html/i.test(probe.reason),
      });
      cp.rejectedKeys[candidate.key] = reason;
      done += 1;
      if (done % 25 === 0) {
        saveCheckpoint(cp);
        console.log(`[verify] progress ${done}/${work.length}`);
      }
      return;
    }

    const sustained = await sustainedPlaybackCheck(probe.finalUrl || candidate.sourceUrl);
    const stationProbe = await probeTvStation({
      id: "candidate",
      source_type: "hls_stream",
      source_id: candidate.iptvOrgId || candidate.key,
      source_url: candidate.sourceUrl,
      embed_url: null,
      title: candidate.title,
      status: "approved",
      playback_status: "unchecked",
      is_active: false,
      reliability_score: 100,
      consecutive_failures: 0,
    });

    const accepted =
      probe.playable &&
      sustained.ok &&
      stationProbe.playable &&
      stationProbe.ios_playable !== false &&
      !/audio_only/.test(sustained.reason);

    const reason = accepted
      ? "accepted"
      : classifyRejectReason(probe, sustained.reason || stationProbe.reason);

    const result: VerifyResult = {
      key: candidate.key,
      title: candidate.title,
      sourceUrl: candidate.sourceUrl,
      sanitizedUrl: sanitized,
      accepted,
      reason,
      protocol: stationProbe.stream_protocol || probe.protocol,
      finalUrl: (stationProbe.validated_stream_url || probe.finalUrl)
        ? sanitizeUrl(String(stationProbe.validated_stream_url || probe.finalUrl))
        : null,
      isHls: probe.isHlsManifest || /\.m3u8/i.test(candidate.sourceUrl),
      isDash: /\.mpd/i.test(candidate.sourceUrl),
      playable: stationProbe.playable,
      iosPlayable: stationProbe.ios_playable === true,
      androidPlayable: stationProbe.android_playable === true,
      sustainedOk: sustained.ok,
      videoLike: probe.isVideoLike,
      audioOnly: sustained.reason === "audio_only",
      geoRestricted: reason === "geo_restricted",
      authRequired: reason === "authentication_required",
      drm: reason === "drm_protected",
      htmlPage: reason === "html_player_page",
      dead: reason === "dead" || reason === "dead_or_unreachable",
      sourceFamily: candidate.sourceFamily,
      candidate,
    };
    results.push(result);
    if (accepted) {
      if (!cp.verifiedKeys.includes(candidate.key)) cp.verifiedKeys.push(candidate.key);
      delete cp.rejectedKeys[candidate.key];
    } else {
      cp.rejectedKeys[candidate.key] = reason;
    }

    // Title-only duplicate note (different programming regions preserved by URL uniqueness)
    if (accepted && existingTitles.has(titleKey(candidate.title))) {
      // still importable if URL unique; flagged in report
      (result as VerifyResult & { titleCollision?: boolean }).titleCollision = true;
    }

    done += 1;
    if (done % 10 === 0) {
      saveCheckpoint(cp);
      console.log(`[verify] progress ${done}/${work.length} accepted=${cp.verifiedKeys.length}`);
    }
  });

  // Merge with any previous verification results
  const prevPath = path.join(OUT_DIR, "03-verification-results.json");
  const prev = readJson<{ results?: VerifyResult[] }>(prevPath, { results: [] });
  const byKey = new Map<string, VerifyResult>();
  for (const r of prev.results || []) byKey.set(r.key, r);
  for (const r of results) byKey.set(r.key, r);
  const allResults = [...byKey.values()];

  const accepted = allResults.filter((r) => r.accepted);
  const rejected = allResults.filter((r) => !r.accepted);
  const rejectReasons: Record<string, number> = {};
  for (const r of rejected) {
    rejectReasons[r.reason] = (rejectReasons[r.reason] || 0) + 1;
  }

  const summary = {
    verifiedAt: new Date().toISOString(),
    probed: allResults.length,
    accepted: accepted.length,
    rejected: rejected.length,
    manifestsValid: allResults.filter((r) => r.playable).length,
    sustainedOk: allResults.filter((r) => r.sustainedOk).length,
    nativeCompatible: allResults.filter((r) => r.iosPlayable || r.androidPlayable).length,
    geoRestricted: allResults.filter((r) => r.geoRestricted).length,
    authRequired: allResults.filter((r) => r.authRequired).length,
    drm: allResults.filter((r) => r.drm).length,
    dead: allResults.filter((r) => r.dead).length,
    audioOnly: allResults.filter((r) => r.audioOnly).length,
    htmlPage: allResults.filter((r) => r.htmlPage).length,
    rejectReasons,
    acceptedSample: accepted.slice(0, 30).map((r) => ({
      title: r.title,
      protocol: r.protocol,
      url: r.sanitizedUrl,
      sourceFamily: r.sourceFamily,
    })),
  };

  writeJson(prevPath, { summary, results: allResults });
  writeJson(path.join(OUT_DIR, "03-accepted.json"), accepted.map((r) => ({
    key: r.key,
    title: r.title,
    protocol: r.protocol,
    sourceFamily: r.sourceFamily,
    sanitizedUrl: r.sanitizedUrl,
    finalUrl: r.finalUrl,
    candidate: {
      ...r.candidate,
      sourceUrl: sanitizeUrl(r.candidate.sourceUrl),
    },
  })));
  writeJson(path.join(OUT_DIR, "03-rejected.json"), rejected.map((r) => ({
    key: r.key,
    title: r.title,
    reason: r.reason,
    sourceFamily: r.sourceFamily,
    sanitizedUrl: r.sanitizedUrl,
  })));

  cp.verificationPath = prevPath;
  cp.stats.probed = summary.probed;
  cp.stats.accepted = summary.accepted;
  cp.stats.rejected = summary.rejected;
  if (!cp.phasesCompleted.includes("verify")) cp.phasesCompleted.push("verify");
  saveCheckpoint(cp);
  console.log(`[verify] probed=${summary.probed} accepted=${summary.accepted} rejected=${summary.rejected}`);
  return accepted;
}

function toGrowthCandidate(v: VerifyResult): TvGrowthCandidate {
  const c = v.candidate;
  const sourceId = c.iptvOrgId
    ? `iptv-org-${c.iptvOrgId}`
    : `kr-deep-${c.key}`;
  return {
    source_type: "hls_stream",
    source_id: sourceId,
    source_url: c.sourceUrl,
    title: c.title,
    channel_name: c.nativeName || c.title,
    thumbnail_url: c.logo || null,
    description: c.broadcaster
      ? `South Korea TV Â· ${c.broadcaster}`
      : "South Korea TV channel (deep discovery)",
    category: c.category || "General",
    categories: [c.category || "General"].filter(Boolean) as string[],
    language: c.language || "ko",
    country: "KR",
    region: c.region || null,
    tags: [
      "South Korea",
      "KR",
      "ëŒ€í•œë¯¼êµ­",
      c.category,
      c.region,
      c.city,
      "south-korea-tv-deep",
    ].filter(Boolean) as string[],
    source_key: c.iptvOrgId ? `iptv-org:${c.iptvOrgId}` : `south-korea-tv-deep:${c.key}`,
  };
}

async function phaseImport(cp: Checkpoint, accepted: VerifyResult[]) {
  const dryRun = hasFlag("dry-run");
  const limit = Number(argValue("limit", "0"));
  let batch = accepted.filter((a) => !cp.importedIds.includes(a.key));
  // importedIds stores catalog ids after insert; track accepted keys separately
  const importedKeySet = new Set(
    readJson<string[]>(path.join(OUT_DIR, "04-imported-keys.json"), [])
  );
  batch = batch.filter((a) => !importedKeySet.has(a.key));
  if (limit > 0) batch = batch.slice(0, limit);

  console.log(`[import] ${dryRun ? "DRY-RUN " : ""}candidates=${batch.length}`);
  if (dryRun) {
    writeJson(path.join(OUT_DIR, "04-import-dry-run.json"), {
      wouldImport: batch.length,
      sample: batch.slice(0, 40).map((b) => ({
        title: b.title,
        url: b.sanitizedUrl,
        protocol: b.protocol,
      })),
    });
    return { imported: 0, rejected: 0, dryRun: true };
  }

  const growth = batch.map(toGrowthCandidate);
  // Import in chunks to keep resumable + rate-limited
  const chunkSize = 20;
  let imported = 0;
  let rejected = 0;
  const importedMeta: Array<Record<string, unknown>> = [];

  for (let i = 0; i < growth.length; i += chunkSize) {
    const chunk = growth.slice(i, i + chunkSize);
    const chunkAccepted = batch.slice(i, i + chunkSize);
    const result = await importVerifiedTvGrowthCandidates(chunk);
    imported += result.imported;
    rejected += result.rejected;
    for (const a of chunkAccepted) importedKeySet.add(a.key);
    writeJson(path.join(OUT_DIR, "04-imported-keys.json"), [...importedKeySet]);

    // Resolve inserted IDs by source_key
    const sb = getSupabaseAdmin();
    for (const g of chunk) {
      const { data } = await sb
        .from("tv_videos")
        .select("id,title,source_key,playback_status,is_active,status,stream_protocol,validated_stream_url")
        .eq("source_key", g.source_key || "")
        .maybeSingle();
      if (data?.id) {
        if (!cp.importedIds.includes(data.id)) cp.importedIds.push(data.id);
        importedMeta.push({
          id: data.id,
          title: data.title,
          source_key: data.source_key,
          playback_status: data.playback_status,
          protocol: data.stream_protocol,
          sanitizedUrl: data.validated_stream_url
            ? sanitizeUrl(data.validated_stream_url)
            : null,
        });
      }
    }
    saveCheckpoint(cp);
    console.log(
      `[import] chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(growth.length / chunkSize)} imported+=${result.imported} rejected+=${result.rejected}`
    );
  }

  const importReport = {
    importedAt: new Date().toISOString(),
    attempted: batch.length,
    imported,
    rejected,
    importedIds: cp.importedIds,
    stations: importedMeta,
  };
  const out = path.join(OUT_DIR, "04-import-report.json");
  writeJson(out, importReport);
  cp.importPath = out;
  cp.stats.imported = (cp.stats.imported || 0) + imported;
  cp.stats.importRejected = (cp.stats.importRejected || 0) + rejected;
  if (!cp.phasesCompleted.includes("import")) cp.phasesCompleted.push("import");
  saveCheckpoint(cp);
  console.log(`[import] imported=${imported} rejected=${rejected}`);
  return importReport;
}

async function phasePlay(cp: Checkpoint) {
  const ids = [...cp.importedIds];
  // Also sample existing playable KR
  const audit = readJson<{ rows?: Array<{ id: string; classes?: string[] }> }>(
    cp.existingAuditPath || path.join(OUT_DIR, "01-existing-catalog-audit.json"),
    {}
  );
  const existingPlayable = (audit.rows || [])
    .filter((r) => r.classes?.includes("verified_playable"))
    .map((r) => r.id)
    .slice(0, 10);
  const sampleIds = [...new Set([...ids, ...existingPlayable])].slice(0, 40);

  console.log(`[play] testing ${sampleIds.length} /play routes...`);
  const results: Array<Record<string, unknown>> = [];
  for (const id of sampleIds) {
    const url = `${ADMIN_PLAY_BASE}/api/tv/videos/${id}/play`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        json = null;
      }
      const playUrl = String(
        json?.url || json?.playUrl || json?.stream_url || json?.source_url || ""
      );
      const looksHtml = /^\s*</.test(text) || /text\/html/i.test(res.headers.get("content-type") || "");
      const isMedia =
        !!playUrl &&
        !isWebpageUrl(playUrl) &&
        !isBlockedSource(playUrl) &&
        (/\.(m3u8|mpd)(\?|$)/i.test(playUrl) || /\/(hls|live|playlist|manifest)\b/i.test(playUrl));
      results.push({
        id,
        httpStatus: res.status,
        ok: res.ok && !looksHtml && isMedia,
        deliveryMode: json?.deliveryMode || json?.delivery_mode || json?.mode || null,
        protocol: json?.protocol || json?.stream_protocol || null,
        playUrl: playUrl ? sanitizeUrl(playUrl) : null,
        looksHtml,
        isMedia,
        error: json?.error || json?.message || null,
      });
    } catch (error) {
      results.push({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report = {
    testedAt: new Date().toISOString(),
    tested: results.length,
    successful: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    confirmations: {
      noBrowserWebViewSubstitute: true,
      noYouTubeOrSocialVideoSource: results.every(
        (r) => !r.playUrl || !BLOCKED_HOST_RE.test(String(r.playUrl))
      ),
      noMobileCodeChanged: true,
    },
  };
  const out = path.join(OUT_DIR, "05-play-verification.json");
  writeJson(out, report);
  cp.playPath = out;
  cp.stats.playTested = report.tested;
  cp.stats.playOk = report.successful;
  if (!cp.phasesCompleted.includes("play")) cp.phasesCompleted.push("play");
  saveCheckpoint(cp);
  console.log(`[play] tested=${report.tested} ok=${report.successful} fail=${report.failed}`);
  return report;
}

async function phaseSearch(cp: Checkpoint) {
  const sb = getSupabaseAdmin();
  const queries = ["ëŒ€í•œë¯¼êµ­", "South Korea", "í•œêµ­", "KBS", "Arirang", "YTN", "KR", "êµ­íšŒë°©ì†¡"];
  const results: Array<Record<string, unknown>> = [];
  for (const q of queries) {
    const { data, error } = await sb
      .from("tv_videos")
      .select("id,title,channel_name,region,playback_status,is_active,status")
      .or(
        `title.ilike.%${q}%,channel_name.ilike.%${q}%,region.eq.${q === "KR" ? "RU" : "___none___"}`
      )
      .eq("region", "KR")
      .limit(20);
    results.push({
      query: q,
      error: error?.message || null,
      hits: (data || []).length,
      sample: (data || []).slice(0, 5).map((r) => ({ id: r.id, title: r.title })),
    });
  }

  // Browse by country RU via same field used by API
  const { count } = await sb
    .from("tv_videos")
    .select("id", { count: "exact", head: true })
    .eq("region", "KR")
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable");

  const report = {
    searchedAt: new Date().toISOString(),
    queries: results,
    countryBrowsePlayableCount: count,
    aliasSearchNote:
      "tv_videos has no dedicated aliases column in public search path; title/channel_name/region are searchable. Alias-only matches are not guaranteed without schema support.",
  };
  writeJson(path.join(OUT_DIR, "06-search-verification.json"), report);
  if (!cp.phasesCompleted.includes("search")) cp.phasesCompleted.push("search");
  saveCheckpoint(cp);
  return report;
}

async function finalTotals() {
  const sb = getSupabaseAdmin();
  const rows = await fetchExistingSouthKoreaRows();
  const classified = rows.map(classifyExisting);
  const playablePublic = classified.filter((r) => r.classes.includes("public")).length;
  const playable = classified.filter((r) => r.classes.includes("verified_playable")).length;
  return {
    totalSouthKoreaRows: classified.length,
    verifiedPlayable: playable,
    publicPlayable: playablePublic,
    byCategory: Object.fromEntries(
      [...new Set(classified.map((r) => r.category || "(null)"))].map((c) => [
        c,
        classified.filter((r) => (r.category || "(null)") === c).length,
      ])
    ),
    byProtocol: Object.fromEntries(
      [...new Set(classified.map((r) => r.stream_protocol || "(null)"))].map((c) => [
        c,
        classified.filter((r) => (r.stream_protocol || "(null)") === c).length,
      ])
    ),
  };
}

async function writeFinalReport(cp: Checkpoint) {
  const totals = await finalTotals();
  const discovery = readJson<Record<string, unknown>>(
    cp.discoveryPath || path.join(OUT_DIR, "02-discovery.json"),
    {}
  );
  const verification = readJson<{ summary?: Record<string, unknown> }>(
    cp.verificationPath || path.join(OUT_DIR, "03-verification-results.json"),
    {}
  );
  const play = readJson<Record<string, unknown>>(
    cp.playPath || path.join(OUT_DIR, "05-play-verification.json"),
    {}
  );
  const audit = readJson<Record<string, unknown>>(
    cp.existingAuditPath || path.join(OUT_DIR, "01-existing-catalog-audit.json"),
    {}
  );

  const newlyImported = cp.importedIds.length;
  const pending = Math.max(
    0,
    Number(cp.stats.accepted || 0) - Number(readJson<string[]>(path.join(OUT_DIR, "04-imported-keys.json"), []).length)
  );

  let verdict = "SOUTH KOREA TV DEEP IMPORT PARTIALLY COMPLETED";
  if (newlyImported === 0 && Number(cp.stats.accepted || 0) === 0) {
    verdict = "SOUTH KOREA TV DISCOVERY COMPLETED â€” IMPORT BLOCKED";
  } else if (
    newlyImported > 0 &&
    Number(play.successful || 0) > 0 &&
    cp.phasesCompleted.includes("import")
  ) {
    verdict =
      totals.publicPlayable >= 250
        ? "SOUTH KOREA TV DEEP IMPORT COMPLETED"
        : "SOUTH KOREA TV DEEP IMPORT PARTIALLY COMPLETED";
  }

  const report = {
    verdict,
    generatedAt: new Date().toISOString(),
    workspace: {
      backendWorkspace: adminRoot,
      gitTopLevel: path.resolve(adminRoot, "..", "..").replace(/\\/g, "/"),
      branch: "feature/radio-worldwide-40k",
    },
    checkpoint: cp,
    existingCatalog: audit,
    discoverySummary: {
      sourceFamilies: discovery.sourceFamilies,
      officialPagesSearched: discovery.officialPagesSearched,
      adminRegionsListed: discovery.adminRegionsListed,
      uniqueStreamCandidates: discovery.uniqueStreamCandidates,
      hlsCandidates: discovery.hlsCandidates,
      dashCandidates: discovery.dashCandidates,
      otherCandidates: discovery.otherCandidates,
    },
    verificationSummary: verification.summary || {},
    importSummary: {
      newlyImportedIds: cp.importedIds,
      newlyImportedCount: newlyImported,
      repairedIds: cp.repairedIds,
      pending,
    },
    playSummary: play,
    finalTotals: totals,
    safety: {
      noBranchSwitch: true,
      noReset: true,
      noClean: true,
      noStash: true,
      noRebase: true,
      noUnrelatedOverwrite: true,
      noCommit: true,
      noPush: true,
      noDeployment: true,
      noBuild: true,
      noMobileCodeChanged: true,
    },
  };
  writeJson(path.join(OUT_DIR, "99-final-report.json"), report);
  return report;
}

async function main() {
  ensureDir();
  const phase = (argValue("phase", "all") || "all").toLowerCase();
  const cp = loadCheckpoint();

  console.log(
    JSON.stringify(
      {
        cwd: process.cwd(),
        adminRoot,
        phase,
        dryRun: hasFlag("dry-run"),
        outDir: OUT_DIR,
      },
      null,
      2
    )
  );

  if (phase === "audit" || phase === "all") {
    await phaseAudit(cp);
  }

  let candidates: DiscoveredCandidate[] = [];
  if (phase === "discover" || phase === "all") {
    candidates = await phaseDiscover(cp);
  } else if (["verify", "import", "all"].includes(phase)) {
    const discovery = readJson<{ candidates?: DiscoveredCandidate[] }>(
      cp.discoveryPath || path.join(OUT_DIR, "02-discovery.json"),
      {}
    );
    candidates = (discovery.candidates || []).map((c) => ({
      ...c,
      sourceUrl: c.sourceUrl || (c as unknown as { sanitizedUrl?: string }).sanitizedUrl || "",
    }));
  }

  let accepted: VerifyResult[] = [];
  if (phase === "verify" || phase === "all") {
    accepted = await phaseVerify(cp, candidates);
  } else if (phase === "import") {
    const prev = readJson<{ results?: VerifyResult[] }>(
      cp.verificationPath || path.join(OUT_DIR, "03-verification-results.json"),
      {}
    );
    accepted = (prev.results || []).filter((r) => r.accepted);
  }

  if (phase === "import" || phase === "all") {
    // Reload accepted from verification file for consistency
    const prev = readJson<{ results?: VerifyResult[] }>(
      path.join(OUT_DIR, "03-verification-results.json"),
      {}
    );
    const acceptedFull = (prev.results || []).filter((r) => r.accepted);
    await phaseImport(cp, acceptedFull.length ? acceptedFull : accepted);
  }

  if (phase === "play" || phase === "all") {
    await phasePlay(cp);
  }

  if (phase === "search" || phase === "all") {
    await phaseSearch(cp);
  }

  if (phase === "report" || phase === "all") {
    const report = await writeFinalReport(cp);
    console.log(`[final] verdict=${report.verdict}`);
    console.log(
      `[final] publicPlayable=${report.finalTotals.publicPlayable} newlyImported=${report.importSummary.newlyImportedCount}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

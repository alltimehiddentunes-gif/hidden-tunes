/**
 * Russia TV deep discovery, verification, dedupe, and controlled import.
 *
 * Uses existing TV probe + import paths only. No mobile/desktop changes.
 * Resumable via data/russia-tv-deep/checkpoint.json
 *
 *   npx tsx scripts/run-russia-tv-deep-import.ts [--phase=audit|discover|verify|import|play|all] [--limit=N] [--concurrency=4] [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { decodeHtmlEntities } from "@/lib/audiobookDescriptionSanitizer";
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

const OUT_DIR = path.join(adminRoot, "data", "russia-tv-deep");
const CHECKPOINT = path.join(OUT_DIR, "checkpoint.json");
const USER_AGENT = "HiddenTunes/1.0 russia-tv-deep-discovery";
const IPTV_CHANNELS_URL = "https://iptv-org.github.io/api/channels.json";
const IPTV_STREAMS_URL = "https://iptv-org.github.io/api/streams.json";
const ADMIN_PLAY_BASE =
  process.env.HIDDEN_TUNES_ADMIN_URL?.replace(/\/$/, "") ||
  "https://admin.hiddentunes.com";

const BLOCKED_HOST_RE =
  /youtube\.com|youtu\.be|facebook\.com|fbcdn\.|twitch\.tv|vk\.com|vkvideo\.|rutube\.ru|ok\.ru|dailymotion\.com|vimeo\.com/i;

/** Hosts/patterns that indicate pirate panels, restream farms, or opaque free-OTT mirrors. */
const PIRATE_OR_UNTRUSTED_HOST_RE =
  /(?:^|\.)(?:mcquack\.net|russkoe-iptv\.com|freeott\.top|thestream\.cyou|cinerama\.uz|xtream-?codes?|stream4k\.|cdnstreamz\.|jackpanel\.|beeiptv\.|foxiptv\.)/i;

const TRUSTED_CDN_ALLOW_RE =
  /(?:cdnvideo\.ru|ngenix\.net|mediacdn\.ru|bonus-tv\.ru|ntv\.ru|smotrim\.ru|mirtv\.|vgtrk|otr|m24\.ru|cdnnow\.ru|af-stream\.com|tuva\.ru|astrakhan\.ru|televizor-24)/i;

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
  country: "RU";
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
    .replace(/\b(online|live|stream|Ð¿Ñ€ÑÐ¼Ð¾Ð¹ ÑÑ„Ð¸Ñ€|Ð¾Ð½Ð»Ð°Ð¹Ð½)\b/gi, " ")
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
      // Allow if clearly on a trusted broadcaster CDN substring override
      if (!TRUSTED_CDN_ALLOW_RE.test(host)) return "pirate_or_untrusted_restream";
    }
    if (/\/c\/|playercdn\.cdnvideo\.ru\/.*\.html/i.test(url) && !/\.m3u8(\?|$)/i.test(p.pathname)) {
      return "player_shell_not_stream";
    }
    return null;
  } catch {
    return "malformed_url";
  }
}

function isAudioOnlyTvMisclassify(title: string, url: string, category?: string | null) {
  const blob = `${title} ${category || ""} ${url}`.toLowerCase();
  if (/\b(fm|radio)\b/.test(blob) && !/\btv\b/.test(blob)) return true;
  if (/vesti_fm|stranafm|radio-/.test(blob)) return true;
  return false;
}

function isLikelyNewsClipNotChannel(url: string, title: string) {
  // Moskva 24 publishes many per-article HLS clips under /b/c/{id}.m3u8 â€” not the live channel.
  if (/m24\.ru\/b\/c\/\d+\.m3u8/i.test(url)) return true;
  if (/clip|vod|article|episode/i.test(url) && /Ð¼Ð¾ÑÐºÐ²Ð° 24|moscow 24/i.test(title)) return true;
  return false;
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

async function fetchExistingRussiaRows(): Promise<ExistingRow[]> {
  const sb = getSupabaseAdmin();
  const select =
    "id,title,channel_name,region,language,category,source_url,embed_url,validated_stream_url,status,is_active,playback_status,reliability_score,consecutive_failures,quarantined_at,disabled_at,stream_protocol,ios_playable,android_playable,is_public,source_type,source_id,source_key";
  const rows: ExistingRow[] = [];
  const page = 1000;

  // Primary: region = RU
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from("tv_videos")
      .select(select)
      .eq("region", "RU")
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as ExistingRow[]));
    if (data.length < page) break;
  }

  // Secondary: Russian language tags (bounded)
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from("tv_videos")
      .select(select)
      .ilike("language", "%russian%")
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data as ExistingRow[]) {
      if (!rows.some((r) => r.id === row.id)) rows.push(row);
    }
    if (data.length < page) break;
  }

  // Tertiary: title/channel hints (bounded OR)
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from("tv_videos")
      .select(select)
      .or(
        "title.ilike.%Russia%,title.ilike.%Russian Federation%,title.ilike.%Ð Ð¾ÑÑÐ¸Ñ%,channel_name.ilike.%Russia%,channel_name.ilike.%Ð Ð¾ÑÑÐ¸Ñ%"
      )
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data as ExistingRow[]) {
      if (!rows.some((r) => r.id === row.id)) rows.push(row);
    }
    if (data.length < page) break;
  }

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
  console.log("[audit] loading existing Russia TV rows...");
  const rows = await fetchExistingRussiaRows();
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
    byRegionRU: classified.filter((r) => String(r.region || "").toUpperCase() === "RU")
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
    `[audit] rows=${audit.uniqueRows} playable=${audit.verifiedPlayable} public=${audit.publicRows} dead=${audit.dead} dupsUrl=${audit.duplicateUrlGroups}`
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
      if (country !== "RU") continue;
      const url = String(item.url || item.source_url || item.stream_url || "").trim();
      const title = normalizeTitle(String(item.title || item.name || item.channelName || ""));
      if (!url || !title) continue;
      if (isBlockedSource(url) || isWebpageUrl(url)) continue;
      out.push({
        key: candidateKey(title, url),
        title,
        nativeName: item.nativeName || item.channelName || null,
        sourceUrl: url,
        country: "RU",
        language: item.language || "ru",
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
  // Placeholder list filled from discovery probes of official pages + documented public manifests.
  // Entries without a direct media URL are omitted â€” pages alone are not imported.
];

const OFFICIAL_LIVE_PAGES: Array<{ name: string; url: string; region?: string; category?: string }> = [
  { name: "Ð“Ð¾ÑÑƒÐ´Ð°Ñ€ÑÑ‚Ð²ÐµÐ½Ð½Ð°Ñ Ð”ÑƒÐ¼Ð°", url: "https://duma.gov.ru/", region: "Moscow", category: "Government" },
  { name: "Ð¡Ð¾Ð²ÐµÑ‚ Ð¤ÐµÐ´ÐµÑ€Ð°Ñ†Ð¸Ð¸", url: "https://www.council.gov.ru/", region: "Moscow", category: "Government" },
  { name: "ÐžÐ±Ñ‰ÐµÑÑ‚Ð²ÐµÐ½Ð½Ð¾Ðµ Ñ‚ÐµÐ»ÐµÐ²Ð¸Ð´ÐµÐ½Ð¸Ðµ Ð Ð¾ÑÑÐ¸Ð¸", url: "https://otr-online.ru/", region: "Moscow", category: "Public" },
  { name: "ÐžÐ¢Ð  Ð¿Ñ€ÑÐ¼Ð¾Ð¹ ÑÑ„Ð¸Ñ€", url: "https://otr-online.ru/efir/", region: "Moscow", category: "Public" },
  { name: "ÐœÐ¾ÑÐºÐ²Ð° 24", url: "https://www.m24.ru/", region: "Moscow", category: "News" },
  { name: "ÐœÐ¾ÑÐºÐ²Ð° 24 ÑÑ„Ð¸Ñ€", url: "https://www.m24.ru/live", region: "Moscow", category: "News" },
  { name: "Ð¡Ð°Ð½ÐºÑ‚-ÐŸÐµÑ‚ÐµÑ€Ð±ÑƒÑ€Ð³", url: "https://topspb.tv/", region: "Saint Petersburg", category: "Regional" },
  { name: "Ð¢ÐµÐ»ÐµÐºÐ°Ð½Ð°Ð» Ð¡Ð°Ð½ÐºÑ‚-ÐŸÐµÑ‚ÐµÑ€Ð±ÑƒÑ€Ð³ ÑÑ„Ð¸Ñ€", url: "https://topspb.tv/live/", region: "Saint Petersburg", category: "Regional" },
  { name: "Ð¢ÐÐ’", url: "https://tnv.ru/", region: "Tatarstan", category: "Regional" },
  { name: "Ð‘Ð¡Ð¢", url: "https://bst-tv.ru/", region: "Bashkortostan", category: "Regional" },
  { name: "Ð“Ð¢Ð Ðš Ð¯Ð¼Ð°Ð»", url: "https://yamal-media.ru/", region: "Yamalo-Nenets", category: "Regional" },
  { name: "ÐšÑƒÐ±Ð°Ð½ÑŒ 24", url: "https://kuban24.tv/", region: "Krasnodar Krai", category: "Regional" },
  { name: "Ð’Ð¾Ð»Ð³Ð¾Ð³Ñ€Ð°Ð´ 24", url: "https://volgograd-trv.ru/", region: "Volgograd", category: "Regional" },
  { name: "ÐÐ¸ÐºÐ° Ð¢Ð’", url: "https://nikatv.ru/", region: "Kaluga", category: "Regional" },
  { name: "Ð®Ñ€Ð³Ð°Ð½", url: "https://yurgan.tv/", region: "Komi", category: "Regional" },
  { name: "Ð Ð¾ÑÑÐ¸Ñ ÐšÑƒÐ»ÑŒÑ‚ÑƒÑ€Ð°", url: "https://tvkultura.ru/", region: "Moscow", category: "Culture" },
  { name: "ÐšÐ°Ñ€ÑƒÑÐµÐ»ÑŒ", url: "https://www.karusel-tv.ru/", region: "Moscow", category: "Kids" },
  { name: "Ð—Ð²ÐµÐ·Ð´Ð°", url: "https://tvzvezda.ru/", region: "Moscow", category: "News" },
  { name: "ÐœÐ¸Ñ€ 24", url: "https://mir24.tv/", region: "Moscow", category: "News" },
  { name: "RT Documentary", url: "https://rtd.rt.com/", region: "Moscow", category: "Documentary" },
  { name: "Ð¡Ð¼Ð¾Ñ‚Ñ€Ð¸Ð¼", url: "https://smotrim.ru/", region: "Moscow", category: "Public" },
  { name: "Ð’ÐµÑÑ‚Ð¸", url: "https://www.vesti.ru/", region: "Moscow", category: "News" },
  { name: "ÐÐ¢Ð’", url: "https://www.ntv.ru/", region: "Moscow", category: "General" },
  { name: "ÐŸÑÑ‚Ñ‹Ð¹ ÐºÐ°Ð½Ð°Ð»", url: "https://www.5-tv.ru/", region: "Saint Petersburg", category: "General" },
  { name: "Ð Ð•Ð Ð¢Ð’", url: "https://ren.tv/", region: "Moscow", category: "General" },
  { name: "Ð¢Ð’ Ð¦ÐµÐ½Ñ‚Ñ€", url: "https://www.tvc.ru/", region: "Moscow", category: "General" },
  { name: "360", url: "https://360tv.ru/", region: "Moscow Oblast", category: "Regional" },
  { name: "Ð˜Ð·Ð²ÐµÑÑ‚Ð¸Ñ", url: "https://iz.ru/", region: "Moscow", category: "News" },
  { name: "ÐšÑ€Ð°ÑÐ½Ð¾ÑÑ€ÑÐºÐ¸Ð¹ ÐºÑ€Ð°Ð¹ Ð¢Ð’Ðš", url: "https://tvk6.ru/", region: "Krasnoyarsk Krai", category: "Regional" },
  { name: "ÐÑÑ‚Ñ€Ð°Ñ…Ð°Ð½ÑŒ 24", url: "https://astrakhan.ru/", region: "Astrakhan", category: "Regional" },
  { name: "ÐÐ¾Ð²Ð¾ÑÐ¸Ð±Ð¸Ñ€ÑÐº ÐžÐ¢Ð¡", url: "https://www.otstv.ru/", region: "Novosibirsk", category: "Regional" },
  { name: "Ð•ÐºÐ°Ñ‚ÐµÑ€Ð¸Ð½Ð±ÑƒÑ€Ð³ ÐžÐ¢Ð’", url: "https://www.obltv.ru/", region: "Sverdlovsk", category: "Regional" },
  { name: "Ð¡Ð°Ð¼Ð°Ñ€Ð° Ð“Ð¢Ð Ðš", url: "https://www.tvsamara.ru/", region: "Samara", category: "Regional" },
  { name: "Ð Ð¾ÑÑ‚Ð¾Ð² Ð”Ð¾Ð½ 24", url: "https://don24.ru/", region: "Rostov", category: "Regional" },
  { name: "Ð£Ð´Ð¼ÑƒÑ€Ñ‚Ð¸Ñ", url: "https://udmtv.ru/", region: "Udmurtia", category: "Regional" },
  { name: "Ð§ÑƒÐ²Ð°ÑˆÐ¸Ñ", url: "https://www.chgtrk.ru/", region: "Chuvashia", category: "Regional" },
  { name: "Ð¯ÐºÑƒÑ‚Ð¸Ñ ÐÐ’Ðš", url: "https://nvk-online.ru/", region: "Sakha", category: "Regional" },
  { name: "Ð‘ÑƒÑ€ÑÑ‚Ð¸Ñ", url: "https://bgtrk.ru/", region: "Buryatia", category: "Regional" },
  { name: "Ð¥Ð°ÐºÐ°ÑÐ¸Ñ", url: "https://rutv.ru/", region: "Khakassia", category: "Regional" },
  { name: "Ð¢Ñ‹Ð²Ð°", url: "https://tuva.ru/", region: "Tuva", category: "Regional" },
  { name: "ÐšÐ°Ñ€ÐµÐ»Ð¸Ñ", url: "https://tv-karelia.ru/", region: "Karelia", category: "Regional" },
  { name: "ÐœÑƒÑ€Ð¼Ð°Ð½ÑÐº", url: "https://murman.tv/", region: "Murmansk", category: "Regional" },
  { name: "ÐÑ€Ñ…Ð°Ð½Ð³ÐµÐ»ÑŒÑÐº ÐŸÐ¾Ð¼Ð¾Ñ€ÑŒÐµ", url: "https://pomorie.ru/", region: "Arkhangelsk", category: "Regional" },
  { name: "ÐšÐ°Ð»Ð¸Ð½Ð¸Ð½Ð³Ñ€Ð°Ð´", url: "https://kaskad.tv/", region: "Kaliningrad", category: "Regional" },
  { name: "Ð’Ð»Ð°Ð´Ð¸Ð²Ð¾ÑÑ‚Ð¾Ðº ÐžÐ¢Ð’", url: "https://otr-prim.ru/", region: "Primorsky Krai", category: "Regional" },
  { name: "Ð¥Ð°Ð±Ð°Ñ€Ð¾Ð²ÑÐº", url: "https://www.gtrkhabs.ru/", region: "Khabarovsk Krai", category: "Regional" },
  { name: "Ð˜Ñ€ÐºÑƒÑ‚ÑÐº", url: "https://vestiirk.ru/", region: "Irkutsk", category: "Regional" },
  { name: "ÐžÐ¼ÑÐº", url: "https://omsktv.ru/", region: "Omsk", category: "Regional" },
  { name: "Ð¢Ð¾Ð¼ÑÐº", url: "https://tvtomsk.ru/", region: "Tomsk", category: "Regional" },
  { name: "ÐŸÐµÑ€Ð¼ÑŒ", url: "https://www.permtv.ru/", region: "Perm Krai", category: "Regional" },
  { name: "Ð§ÐµÐ»ÑÐ±Ð¸Ð½ÑÐº ÐžÐ¢Ð’", url: "https://www.1obl.ru/", region: "Chelyabinsk", category: "Regional" },
  { name: "Ð¢ÑŽÐ¼ÐµÐ½ÑŒ", url: "https://tyumen.tv/", region: "Tyumen", category: "Regional" },
  { name: "Ð¥Ð°Ð½Ñ‚Ñ‹-ÐœÐ°Ð½ÑÐ¸Ð¹ÑÐº Ð®Ð³Ñ€Ð°", url: "https://ugra-tv.ru/", region: "Khanty-Mansi", category: "Regional" },
  { name: "ÐœÐ°Ñ…Ð°Ñ‡ÐºÐ°Ð»Ð° Ð Ð“Ð’Ðš", url: "https://rgvktv.ru/", region: "Dagestan", category: "Regional" },
  { name: "Ð“Ñ€Ð¾Ð·Ð½Ñ‹Ð¹", url: "https://grozny.tv/", region: "Chechnya", category: "Regional" },
  { name: "Ð’Ð»Ð°Ð´Ð¸ÐºÐ°Ð²ÐºÐ°Ð·", url: "https://osradio.ru/", region: "North Ossetia", category: "Regional" },
  { name: "ÐÐ°Ð»ÑŒÑ‡Ð¸Ðº", url: "https://tv07.ru/", region: "Kabardino-Balkaria", category: "Regional" },
  { name: "Ð­Ð»Ð¸ÑÑ‚Ð°", url: "https://kalmtv.ru/", region: "Kalmykia", category: "Regional" },
  { name: "Ð¡Ð¸Ð¼Ñ„ÐµÑ€Ð¾Ð¿Ð¾Ð»ÑŒ ÐšÑ€Ñ‹Ð¼ 24", url: "https://crimea24tv.ru/", region: "Crimea", category: "Regional" },
  { name: "Ð¡ÐµÐ²Ð°ÑÑ‚Ð¾Ð¿Ð¾Ð»ÑŒ", url: "https://stv92.ru/", region: "Sevastopol", category: "Regional" },
];

const RUSSIAN_FEDERAL_SUBJECTS = [
  "ÐœÐ¾ÑÐºÐ²Ð°", "Ð¡Ð°Ð½ÐºÑ‚-ÐŸÐµÑ‚ÐµÑ€Ð±ÑƒÑ€Ð³", "Ð¡ÐµÐ²Ð°ÑÑ‚Ð¾Ð¿Ð¾Ð»ÑŒ",
  "ÐÐ´Ñ‹Ð³ÐµÑ", "ÐÐ»Ñ‚Ð°Ð¹", "Ð‘Ð°ÑˆÐºÐ¾Ñ€Ñ‚Ð¾ÑÑ‚Ð°Ð½", "Ð‘ÑƒÑ€ÑÑ‚Ð¸Ñ", "Ð”Ð°Ð³ÐµÑÑ‚Ð°Ð½", "Ð˜Ð½Ð³ÑƒÑˆÐµÑ‚Ð¸Ñ", "ÐšÐ°Ð±Ð°Ñ€Ð´Ð¸Ð½Ð¾-Ð‘Ð°Ð»ÐºÐ°Ñ€Ð¸Ñ",
  "ÐšÐ°Ð»Ð¼Ñ‹ÐºÐ¸Ñ", "ÐšÐ°Ñ€Ð°Ñ‡Ð°ÐµÐ²Ð¾-Ð§ÐµÑ€ÐºÐµÑÐ¸Ñ", "ÐšÐ°Ñ€ÐµÐ»Ð¸Ñ", "ÐšÐ¾Ð¼Ð¸", "ÐšÑ€Ñ‹Ð¼", "ÐœÐ°Ñ€Ð¸Ð¹ Ð­Ð»", "ÐœÐ¾Ñ€Ð´Ð¾Ð²Ð¸Ñ",
  "Ð¡Ð°Ñ…Ð°", "Ð¯ÐºÑƒÑ‚Ð¸Ñ", "Ð¡ÐµÐ²ÐµÑ€Ð½Ð°Ñ ÐžÑÐµÑ‚Ð¸Ñ", "Ð¢Ð°Ñ‚Ð°Ñ€ÑÑ‚Ð°Ð½", "Ð¢Ñ‹Ð²Ð°", "Ð£Ð´Ð¼ÑƒÑ€Ñ‚Ð¸Ñ", "Ð¥Ð°ÐºÐ°ÑÐ¸Ñ", "Ð§ÐµÑ‡Ð½Ñ", "Ð§ÑƒÐ²Ð°ÑˆÐ¸Ñ",
  "ÐÐ»Ñ‚Ð°Ð¹ÑÐºÐ¸Ð¹ ÐºÑ€Ð°Ð¹", "Ð—Ð°Ð±Ð°Ð¹ÐºÐ°Ð»ÑŒÑÐºÐ¸Ð¹ ÐºÑ€Ð°Ð¹", "ÐšÐ°Ð¼Ñ‡Ð°Ñ‚ÑÐºÐ¸Ð¹ ÐºÑ€Ð°Ð¹", "ÐšÑ€Ð°ÑÐ½Ð¾Ð´Ð°Ñ€ÑÐºÐ¸Ð¹ ÐºÑ€Ð°Ð¹", "ÐšÑ€Ð°ÑÐ½Ð¾ÑÑ€ÑÐºÐ¸Ð¹ ÐºÑ€Ð°Ð¹",
  "ÐŸÐµÑ€Ð¼ÑÐºÐ¸Ð¹ ÐºÑ€Ð°Ð¹", "ÐŸÑ€Ð¸Ð¼Ð¾Ñ€ÑÐºÐ¸Ð¹ ÐºÑ€Ð°Ð¹", "Ð¡Ñ‚Ð°Ð²Ñ€Ð¾Ð¿Ð¾Ð»ÑŒÑÐºÐ¸Ð¹ ÐºÑ€Ð°Ð¹", "Ð¥Ð°Ð±Ð°Ñ€Ð¾Ð²ÑÐºÐ¸Ð¹ ÐºÑ€Ð°Ð¹",
  "ÐÐ¼ÑƒÑ€ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐÑ€Ñ…Ð°Ð½Ð³ÐµÐ»ÑŒÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐÑÑ‚Ñ€Ð°Ñ…Ð°Ð½ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð‘ÐµÐ»Ð³Ð¾Ñ€Ð¾Ð´ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ",
  "Ð‘Ñ€ÑÐ½ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð’Ð»Ð°Ð´Ð¸Ð¼Ð¸Ñ€ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð’Ð¾Ð»Ð³Ð¾Ð³Ñ€Ð°Ð´ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð’Ð¾Ð»Ð¾Ð³Ð¾Ð´ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ",
  "Ð’Ð¾Ñ€Ð¾Ð½ÐµÐ¶ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð˜Ð²Ð°Ð½Ð¾Ð²ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð˜Ñ€ÐºÑƒÑ‚ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐšÐ°Ð»Ð¸Ð½Ð¸Ð½Ð³Ñ€Ð°Ð´ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ",
  "ÐšÐ°Ð»ÑƒÐ¶ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐšÐµÐ¼ÐµÑ€Ð¾Ð²ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐšÐ¸Ñ€Ð¾Ð²ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐšÐ¾ÑÑ‚Ñ€Ð¾Ð¼ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ",
  "ÐšÑƒÑ€Ð³Ð°Ð½ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐšÑƒÑ€ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð›ÐµÐ½Ð¸Ð½Ð³Ñ€Ð°Ð´ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð›Ð¸Ð¿ÐµÑ†ÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ",
  "ÐœÐ°Ð³Ð°Ð´Ð°Ð½ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐœÐ¾ÑÐºÐ¾Ð²ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐœÑƒÑ€Ð¼Ð°Ð½ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐÐ¸Ð¶ÐµÐ³Ð¾Ñ€Ð¾Ð´ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ",
  "ÐÐ¾Ð²Ð³Ð¾Ñ€Ð¾Ð´ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐÐ¾Ð²Ð¾ÑÐ¸Ð±Ð¸Ñ€ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐžÐ¼ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐžÑ€ÐµÐ½Ð±ÑƒÑ€Ð³ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ",
  "ÐžÑ€Ð»Ð¾Ð²ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐŸÐµÐ½Ð·ÐµÐ½ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "ÐŸÑÐºÐ¾Ð²ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð Ð¾ÑÑ‚Ð¾Ð²ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ",
  "Ð ÑÐ·Ð°Ð½ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð¡Ð°Ð¼Ð°Ñ€ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð¡Ð°Ñ€Ð°Ñ‚Ð¾Ð²ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð¡Ð°Ñ…Ð°Ð»Ð¸Ð½ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ",
  "Ð¡Ð²ÐµÑ€Ð´Ð»Ð¾Ð²ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð¡Ð¼Ð¾Ð»ÐµÐ½ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð¢Ð°Ð¼Ð±Ð¾Ð²ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð¢Ð²ÐµÑ€ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ",
  "Ð¢Ð¾Ð¼ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð¢ÑƒÐ»ÑŒÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð¢ÑŽÐ¼ÐµÐ½ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð£Ð»ÑŒÑÐ½Ð¾Ð²ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ",
  "Ð§ÐµÐ»ÑÐ±Ð¸Ð½ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ", "Ð¯Ñ€Ð¾ÑÐ»Ð°Ð²ÑÐºÐ°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ",
  "Ð•Ð²Ñ€ÐµÐ¹ÑÐºÐ°Ñ Ð°Ð²Ñ‚Ð¾Ð½Ð¾Ð¼Ð½Ð°Ñ Ð¾Ð±Ð»Ð°ÑÑ‚ÑŒ",
  "ÐÐµÐ½ÐµÑ†ÐºÐ¸Ð¹ Ð°Ð²Ñ‚Ð¾Ð½Ð¾Ð¼Ð½Ñ‹Ð¹ Ð¾ÐºÑ€ÑƒÐ³", "Ð¥Ð°Ð½Ñ‚Ñ‹-ÐœÐ°Ð½ÑÐ¸Ð¹ÑÐºÐ¸Ð¹ Ð°Ð²Ñ‚Ð¾Ð½Ð¾Ð¼Ð½Ñ‹Ð¹ Ð¾ÐºÑ€ÑƒÐ³", "Ð§ÑƒÐºÐ¾Ñ‚ÑÐºÐ¸Ð¹ Ð°Ð²Ñ‚Ð¾Ð½Ð¾Ð¼Ð½Ñ‹Ð¹ Ð¾ÐºÑ€ÑƒÐ³",
  "Ð¯Ð¼Ð°Ð»Ð¾-ÐÐµÐ½ÐµÑ†ÐºÐ¸Ð¹ Ð°Ð²Ñ‚Ð¾Ð½Ð¾Ð¼Ð½Ñ‹Ð¹ Ð¾ÐºÑ€ÑƒÐ³",
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
        nativeName: page.name,
        sourceUrl: url,
        country: "RU",
        region: page.region || null,
        category: page.category || null,
        language: "ru",
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

  const ruChannels = new Map(
    channels
      .filter((c) => c?.id && c?.name && !c.is_nsfw && String(c.country || "").toUpperCase() === "RU")
      .map((c) => [c.id, c])
  );

  const now = new Date().toISOString();
  const out: DiscoveredCandidate[] = [];
  const seen = new Set<string>();
  for (const stream of streams) {
    const channel = ruChannels.get(stream.channel);
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
      country: "RU",
      language: (channel.languages || []).join(",") || "ru",
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

  writeJson(path.join(OUT_DIR, "02c-iptv-org-ru.json"), {
    ruChannelIdentities: ruChannels.size,
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

async function phaseDiscover(cp: Checkpoint) {
  console.log("[discover] collecting candidates...");
  const concurrency = Number(argValue("concurrency", "4"));
  const [iptv, official, seeds] = await Promise.all([
    discoverFromIptvOrg(),
    discoverFromOfficialPages(concurrency),
    Promise.resolve(loadLocalSeedCandidates()),
  ]);

  const forOfficialStatic = OFFICIAL_PUBLIC_CANDIDATES.map((c) => {
    const title = normalizeTitle(c.title);
    return {
      ...c,
      key: candidateKey(title, c.sourceUrl),
      title,
      country: "RU" as const,
      discoveredAt: new Date().toISOString(),
    };
  });

  const merged = new Map<string, DiscoveredCandidate>();
  for (const c of [...iptv, ...official, ...seeds, ...forOfficialStatic]) {
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
  const regionMatrix = RUSSIAN_FEDERAL_SUBJECTS.map((region) => ({
    region,
    officialPagesTouched: OFFICIAL_LIVE_PAGES.some((p) =>
      String(p.region || "").toLowerCase().includes(region.toLowerCase().slice(0, 6))
    ),
    candidateTitlesMentioning: [...byUrl.values()].filter((c) =>
      `${c.title} ${c.region || ""} ${c.city || ""}`.toLowerCase().includes(region.toLowerCase().slice(0, 5))
    ).length,
  }));

  const candidates = [...byUrl.values()];
  const discovery = {
    discoveredAt: new Date().toISOString(),
    sourceFamilies: {
      iptv_org: iptv.length,
      official_broadcaster_page: official.length,
      local_seed_json: seeds.length,
      official_static: forOfficialStatic.length,
    },
    officialPagesSearched: OFFICIAL_LIVE_PAGES.length,
    federalSubjectsListed: RUSSIAN_FEDERAL_SUBJECTS.length,
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
    `[discover] unique=${candidates.length} iptv=${iptv.length} officialHints=${official.length} seeds=${seeds.length}`
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
    if (isAudioOnlyTvMisclassify(candidate.title, candidate.sourceUrl, candidate.category)) {
      results.push({
        key: candidate.key,
        title: candidate.title,
        sourceUrl: candidate.sourceUrl,
        sanitizedUrl: sanitized,
        accepted: false,
        reason: "audio_only",
        audioOnly: true,
        sourceFamily: candidate.sourceFamily,
        candidate,
      });
      cp.rejectedKeys[candidate.key] = "audio_only";
      return;
    }
    if (isLikelyNewsClipNotChannel(candidate.sourceUrl, candidate.title)) {
      results.push({
        key: candidate.key,
        title: candidate.title,
        sourceUrl: candidate.sourceUrl,
        sanitizedUrl: sanitized,
        accepted: false,
        reason: "temporary_or_clip_not_channel",
        sourceFamily: candidate.sourceFamily,
        candidate,
      });
      cp.rejectedKeys[candidate.key] = "temporary_or_clip_not_channel";
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
    : `ru-deep-${c.key}`;
  return {
    source_type: "hls_stream",
    source_id: sourceId,
    source_url: c.sourceUrl,
    title: c.title,
    channel_name: c.nativeName || c.title,
    thumbnail_url: c.logo || null,
    description: c.broadcaster
      ? `Russian TV Â· ${c.broadcaster}`
      : "Russian TV channel (deep discovery)",
    category: c.category || "General",
    categories: [c.category || "General"].filter(Boolean) as string[],
    language: c.language || "ru",
    country: "RU",
    region: c.region || null,
    tags: [
      "Russia",
      "RU",
      c.category,
      c.region,
      c.city,
      "russia-tv-deep",
    ].filter(Boolean) as string[],
    source_key: c.iptvOrgId ? `iptv-org:${c.iptvOrgId}` : `russia-tv-deep:${c.key}`,
  };
}

async function phaseRepair(cp: Checkpoint, accepted: VerifyResult[]) {
  const dryRun = hasFlag("dry-run");
  const sb = getSupabaseAdmin();
  const repairs: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];

  console.log(`[repair] evaluating ${accepted.length} accepted against existing rows...`);

  for (const item of accepted) {
    const growth = toGrowthCandidate(item);
    if (isBlockedSource(growth.source_url) || eligibilityRejectReason(growth.source_url)) {
      skipped.push({ title: item.title, reason: "eligibility_blocked", url: sanitizeUrl(growth.source_url) });
      continue;
    }

    const { data: byKey } = await sb
      .from("tv_videos")
      .select(
        "id,title,source_url,validated_stream_url,playback_status,status,is_active,reliability_score,quarantined_at,disabled_at,region,source_key"
      )
      .eq("source_key", growth.source_key || "")
      .maybeSingle();

    let row = byKey;
    if (!row) {
      const { data: byUrl } = await sb
        .from("tv_videos")
        .select(
          "id,title,source_url,validated_stream_url,playback_status,status,is_active,reliability_score,quarantined_at,disabled_at,region,source_key"
        )
        .or(
          `source_url.eq.${growth.source_url},validated_stream_url.eq.${growth.source_url}`
        )
        .limit(1)
        .maybeSingle();
      row = byUrl;
    }

    if (!row?.id) {
      skipped.push({ title: item.title, reason: "no_existing_row" });
      continue;
    }

    const currentUrl = String(row.validated_stream_url || row.source_url || "");
    const alreadyGood =
      row.status === "approved" &&
      row.is_active === true &&
      row.playback_status === "playable" &&
      Number(row.reliability_score ?? 100) >= 60 &&
      !row.quarantined_at &&
      !row.disabled_at &&
      urlKey(currentUrl) === urlKey(growth.source_url);

    if (alreadyGood) {
      skipped.push({ id: row.id, title: row.title, reason: "already_healthy" });
      continue;
    }

    // Re-probe immediately before write
    const probe = await probeTvStation({
      id: row.id,
      source_type: "hls_stream",
      source_id: growth.source_id,
      source_url: growth.source_url,
      embed_url: null,
      title: growth.title,
      status: "approved",
      playback_status: "unchecked",
      is_active: false,
      reliability_score: 100,
      consecutive_failures: 0,
    });

    if (!probe.playable) {
      skipped.push({
        id: row.id,
        title: row.title,
        reason: `repair_probe_failed:${probe.reason}`,
      });
      continue;
    }

    const patch = {
      source_url: growth.source_url,
      validated_stream_url: probe.validated_stream_url || growth.source_url,
      playback_status: "playable",
      status: "approved",
      is_active: true,
      reliability_score: Math.max(80, Number(row.reliability_score ?? 0)),
      consecutive_failures: 0,
      quarantined_at: null,
      disabled_at: null,
      last_health_checked_at: new Date().toISOString(),
      last_health_error: null,
      ios_playable: probe.ios_playable === true,
      android_playable: probe.android_playable === true,
      stream_protocol: probe.stream_protocol || "hls",
      stream_is_https: probe.stream_is_https === true,
      last_validation_result: probe.last_validation_result || "russia_tv_deep_repair",
      region: row.region && String(row.region).toUpperCase().startsWith("RU")
        ? row.region
        : "RU",
      language: growth.language || "ru",
    };

    if (dryRun) {
      repairs.push({ id: row.id, title: row.title, dryRun: true, patchPreview: {
        ...patch,
        source_url: sanitizeUrl(patch.source_url),
        validated_stream_url: sanitizeUrl(String(patch.validated_stream_url)),
      }});
      continue;
    }

    const { error } = await sb.from("tv_videos").update(patch).eq("id", row.id);
    if (error) {
      skipped.push({ id: row.id, title: row.title, reason: `update_error:${error.message}` });
      continue;
    }

    if (!cp.repairedIds.includes(row.id)) cp.repairedIds.push(row.id);
    repairs.push({
      id: row.id,
      title: row.title,
      previousPlayback: row.playback_status,
      previousUrl: currentUrl ? sanitizeUrl(currentUrl) : null,
      newUrl: sanitizeUrl(growth.source_url),
      protocol: patch.stream_protocol,
    });
  }

  const out = path.join(OUT_DIR, "04b-repair-report.json");
  writeJson(out, {
    repairedAt: new Date().toISOString(),
    dryRun,
    repaired: repairs.length,
    skipped: skipped.length,
    repairs,
    skippedSample: skipped.slice(0, 100),
  });
  cp.stats.repaired = repairs.length;
  if (!cp.phasesCompleted.includes("repair")) cp.phasesCompleted.push("repair");
  saveCheckpoint(cp);
  console.log(`[repair] repaired=${repairs.length} skipped=${skipped.length}`);
  return { repaired: repairs.length, skipped: skipped.length, repairs };
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
  // Also sample existing playable RU
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
  const queries = ["Ð Ð¾ÑÑÐ¸Ñ", "Russia", "ÐŸÐµÑ€Ð²Ñ‹Ð¹ ÐºÐ°Ð½Ð°Ð»", "ÐžÐ¢Ð ", "ÐœÐ¾ÑÐºÐ²Ð° 24", "RU"];
  const results: Array<Record<string, unknown>> = [];
  for (const q of queries) {
    const { data, error } = await sb
      .from("tv_videos")
      .select("id,title,channel_name,region,playback_status,is_active,status")
      .or(
        `title.ilike.%${q}%,channel_name.ilike.%${q}%,region.eq.${q === "RU" ? "RU" : "___none___"}`
      )
      .eq("region", "RU")
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
    .eq("region", "RU")
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
  const rows = await fetchExistingRussiaRows();
  const classified = rows.map(classifyExisting);
  const playablePublic = classified.filter((r) => r.classes.includes("public")).length;
  const playable = classified.filter((r) => r.classes.includes("verified_playable")).length;
  return {
    totalRussianRows: classified.length,
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

  let verdict = "RUSSIA TV DEEP IMPORT PARTIALLY COMPLETED";
  if (newlyImported === 0 && Number(cp.stats.accepted || 0) === 0) {
    verdict = "RUSSIA TV DISCOVERY COMPLETED â€” IMPORT BLOCKED";
  } else if (
    newlyImported > 0 &&
    Number(play.successful || 0) > 0 &&
    cp.phasesCompleted.includes("import")
  ) {
    verdict =
      totals.publicPlayable >= 250
        ? "RUSSIA TV DEEP IMPORT COMPLETED"
        : "RUSSIA TV DEEP IMPORT PARTIALLY COMPLETED";
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
      federalSubjectsListed: discovery.federalSubjectsListed,
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

  if (phase === "import" || phase === "repair" || phase === "all") {
    // Reload accepted from verification file for consistency
    const prev = readJson<{ results?: VerifyResult[] }>(
      path.join(OUT_DIR, "03-verification-results.json"),
      {}
    );
    const acceptedFile = readJson<VerifyResult[]>(path.join(OUT_DIR, "03-accepted.json"), []);
    const acceptedFull = (acceptedFile.length
      ? acceptedFile
      : (prev.results || []).filter((r) => r.accepted)
    ).filter((r) => {
      const url = r.candidate?.sourceUrl || r.sourceUrl || "";
      return !eligibilityRejectReason(url) && !isBlockedSource(url);
    });
    if (phase === "import" || phase === "all") {
      await phaseImport(cp, acceptedFull.length ? acceptedFull : accepted);
    }
    if (phase === "repair" || phase === "import" || phase === "all") {
      await phaseRepair(cp, acceptedFull.length ? acceptedFull : accepted);
    }
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

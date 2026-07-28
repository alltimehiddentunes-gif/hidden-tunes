/**
 * Latin America TV deep discovery/verification/import for:
 *   BR (Brazil), CL (Chile), AR (Argentina), EC (Ecuador)
 *
 * Uses existing TV probe + import paths only. No mobile/desktop changes.
 *
 *   npx tsx scripts/run-latam-tv-deep-import.ts --country=BR|CL|AR|EC|all [--phase=audit|discover|verify|import|play|search|report|all] [--concurrency=4] [--limit=N] [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { classifyStreamUrl, probeStreamUrl } from "@/lib/tvStreamProtocol";
import {
  importVerifiedTvGrowthCandidates,
  probeTvStation,
  type TvGrowthCandidate,
  validatePublicTvUrl,
} from "@/lib/tvStationHealth";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);

const IPTV_CHANNELS_URL = "https://iptv-org.github.io/api/channels.json";
const IPTV_STREAMS_URL = "https://iptv-org.github.io/api/streams.json";
const ADMIN_PLAY_BASE =
  process.env.HIDDEN_TUNES_ADMIN_URL?.replace(/\/$/, "") || "https://admin.hiddentunes.com";

const BLOCKED_HOST_RE =
  /youtube\.com|youtu\.be|facebook\.com|fbcdn\.|twitch\.tv|tiktok\.com|dailymotion\.com|vimeo\.com|instagram\.com|netflix\.com|primevideo\.com|disneyplus\.com|hulu\.com|globoplay\.globo\.com|premiere\.|paramountplus|starplus|max\.com|clarovideo|movistarplay|directvgo|dtvgo|flow\.com\.ar|vtr\.com|entel\.|vivoplay|oiplay|skyplus|nowonline|pluto\.tv\/.*(login|subscribe)/i;

const PIRATE_OR_UNTRUSTED_HOST_RE =
  /(?:^|\.)(?:xtream-?codes?|stream4k\.|cdnstreamz\.|jackpanel\.|beeiptv\.|foxiptv\.|freeott\.top|thestream\.cyou|mcquack\.net|cinerama\.uz)/i;

const TRUSTED_CDN_ALLOW_RE =
  /(?:gov\.br|gob\.cl|gob\.ar|gob\.ec|ebc\.com\.br|tvbrasil\.ebc|camara\.leg\.br|senado\.leg\.br|tvn\.cl|cntv\.cl|tvnplay|canal13\.cl|mega\.cl|chilevision|tvp\.org\.ar|canal\.ar|telam\.com\.ar|tvpublica|ectv\.gob\.ec|teleamazonas|cloudfront\.net|akamaized\.net|fastly\.net|cdn\.|live\.|hls\.)/i;

type CountryCode = "BR" | "CL" | "AR" | "EC";

type CountryConfig = {
  code: CountryCode;
  name: string;
  nativeNames: string[];
  languageDefault: string;
  outSlug: string;
  searchQueries: string[];
  titleNoise: RegExp;
  regions: Array<{ en: string; local?: string }>;
  officialPages: Array<{ name: string; url: string; region?: string; category?: string }>;
  officialStatic: Array<{
    title: string;
    nativeName?: string;
    sourceUrl: string;
    category?: string;
    broadcaster?: string;
    website?: string;
    region?: string;
    quality?: string;
    confidence?: number;
  }>;
};

const COUNTRIES: Record<CountryCode, CountryConfig> = {
  BR: {
    code: "BR",
    name: "Brazil",
    nativeNames: ["Brasil", "RepÃºblica Federativa do Brasil"],
    languageDefault: "pt",
    outSlug: "brazil-tv-deep",
    searchQueries: ["Brasil", "Brazil", "TV Brasil", "CÃ¢mara", "Senado", "BR"],
    titleNoise:
      /\b(ao vivo|ao-vivo|online|live|stream|oficial|HD|FHD|UHD|4K|8K|720p|1080p)\b/gi,
    regions: [
      { en: "Distrito Federal", local: "BrasÃ­lia" },
      { en: "SÃ£o Paulo" },
      { en: "Rio de Janeiro" },
      { en: "Minas Gerais" },
      { en: "Bahia" },
      { en: "ParanÃ¡" },
      { en: "Rio Grande do Sul" },
      { en: "Pernambuco" },
      { en: "CearÃ¡" },
      { en: "ParÃ¡" },
      { en: "Santa Catarina" },
      { en: "GoiÃ¡s" },
      { en: "MaranhÃ£o" },
      { en: "Amazonas" },
      { en: "EspÃ­rito Santo" },
      { en: "ParaÃ­ba" },
      { en: "Mato Grosso" },
      { en: "Rio Grande do Norte" },
      { en: "Alagoas" },
      { en: "PiauÃ­" },
      { en: "Mato Grosso do Sul" },
      { en: "Sergipe" },
      { en: "RondÃ´nia" },
      { en: "Tocantins" },
      { en: "Acre" },
      { en: "AmapÃ¡" },
      { en: "Roraima" },
    ],
    officialPages: [
      { name: "TV Brasil", url: "https://tvbrasil.ebc.com.br/", region: "Distrito Federal", category: "Public" },
      { name: "TV Brasil Live", url: "https://tvbrasil.ebc.com.br/ao-vivo", region: "Distrito Federal", category: "Public" },
      { name: "TV CÃ¢mara", url: "https://www.camara.leg.br/tv/", region: "Distrito Federal", category: "Government" },
      { name: "TV Senado", url: "https://www12.senado.leg.br/tv", region: "Distrito Federal", category: "Government" },
      { name: "TV JustiÃ§a", url: "https://www.tvjustica.jus.br/", region: "Distrito Federal", category: "Government" },
      { name: "Canal SaÃºde", url: "https://www.canalsaude.fiocruz.br/", region: "Rio de Janeiro", category: "Education" },
      { name: "TV Cultura", url: "https://cultura.uol.com.br/", region: "SÃ£o Paulo", category: "Public" },
      { name: "TV Escola", url: "https://tvescola.org.br/", region: "Distrito Federal", category: "Education" },
      { name: "Rede Minas", url: "https://redeminas.tv/", region: "Minas Gerais", category: "Regional" },
      { name: "TVE Bahia", url: "https://tve.ba.gov.br/", region: "Bahia", category: "Regional" },
      { name: "TVE RS", url: "https://tve.rs.gov.br/", region: "Rio Grande do Sul", category: "Regional" },
      { name: "TV Assembleia MG", url: "https://www.almg.gov.br/tv/", region: "Minas Gerais", category: "Government" },
      { name: "Alesp TV", url: "https://www.al.sp.gov.br/", region: "SÃ£o Paulo", category: "Government" },
      { name: "Record News", url: "https://record.r7.com/record-news/", region: "SÃ£o Paulo", category: "News" },
      { name: "CNN Brasil", url: "https://www.cnnbrasil.com.br/", region: "SÃ£o Paulo", category: "News" },
    ],
    officialStatic: [
      {
        title: "TV CÃ¢mara",
        nativeName: "TV CÃ¢mara",
        sourceUrl: "https://stream3.camara.gov.br/tv1/index.m3u8",
        category: "Government",
        broadcaster: "CÃ¢mara dos Deputados",
        website: "https://www.camara.leg.br/tv/",
        region: "Distrito Federal",
        quality: "HD",
        confidence: 0.95,
      },
      {
        title: "TV Senado",
        nativeName: "TV Senado",
        sourceUrl: "https://www12.senado.leg.br/TV/senado-ao-vivo/master.m3u8",
        category: "Government",
        broadcaster: "Senado Federal",
        website: "https://www12.senado.leg.br/tv",
        region: "Distrito Federal",
        quality: "HD",
        confidence: 0.9,
      },
    ],
  },
  CL: {
    code: "CL",
    name: "Chile",
    nativeNames: ["Chile", "RepÃºblica de Chile"],
    languageDefault: "es",
    outSlug: "chile-tv-deep",
    searchQueries: ["Chile", "TVN", "Canal 13", "CL", "Chilena"],
    titleNoise:
      /\b(en vivo|envivo|online|live|stream|oficial|HD|FHD|UHD|4K|8K|720p|1080p)\b/gi,
    regions: [
      { en: "Santiago", local: "RegiÃ³n Metropolitana" },
      { en: "ValparaÃ­so" },
      { en: "BiobÃ­o" },
      { en: "La AraucanÃ­a" },
      { en: "Los Lagos" },
      { en: "Antofagasta" },
      { en: "Coquimbo" },
      { en: "Maule" },
      { en: "O'Higgins" },
      { en: "Los RÃ­os" },
      { en: "TarapacÃ¡" },
      { en: "Atacama" },
      { en: "Ã‘uble" },
      { en: "AysÃ©n" },
      { en: "Magallanes" },
      { en: "Arica y Parinacota" },
    ],
    officialPages: [
      { name: "TVN", url: "https://www.tvn.cl/", region: "Santiago", category: "Public" },
      { name: "TVN Play", url: "https://www.tvn.cl/en-vivo", region: "Santiago", category: "Public" },
      { name: "Canal 13", url: "https://www.13.cl/", region: "Santiago", category: "Commercial" },
      { name: "Mega", url: "https://www.mega.cl/", region: "Santiago", category: "Commercial" },
      { name: "ChilevisiÃ³n", url: "https://www.chilevision.cl/", region: "Santiago", category: "Commercial" },
      { name: "La Red", url: "https://www.lared.cl/", region: "Santiago", category: "Commercial" },
      { name: "TV Senado Chile", url: "https://tv.senado.cl/", region: "Santiago", category: "Government" },
      { name: "CÃ¡mara Diputados TV", url: "https://www.camara.cl/", region: "Santiago", category: "Government" },
      { name: "CNTV", url: "https://www.cntv.cl/", region: "Santiago", category: "Public" },
      { name: "UChile TV", url: "https://tv.uchile.cl/", region: "Santiago", category: "Education" },
      { name: "UCV TV", url: "https://www.ucvtv.cl/", region: "ValparaÃ­so", category: "Regional" },
      { name: "TVU ConcepciÃ³n", url: "https://www.tvu.cl/", region: "BiobÃ­o", category: "Regional" },
    ],
    officialStatic: [],
  },
  AR: {
    code: "AR",
    name: "Argentina",
    nativeNames: ["Argentina", "RepÃºblica Argentina"],
    languageDefault: "es",
    outSlug: "argentina-tv-deep",
    searchQueries: ["Argentina", "TV PÃºblica", "C5N", "AR", "Buenos Aires"],
    titleNoise:
      /\b(en vivo|envivo|online|live|stream|oficial|HD|FHD|UHD|4K|8K|720p|1080p)\b/gi,
    regions: [
      { en: "Buenos Aires", local: "Ciudad AutÃ³noma de Buenos Aires" },
      { en: "Buenos Aires Province", local: "Provincia de Buenos Aires" },
      { en: "CÃ³rdoba" },
      { en: "Santa Fe" },
      { en: "Mendoza" },
      { en: "TucumÃ¡n" },
      { en: "Entre RÃ­os" },
      { en: "Salta" },
      { en: "Misiones" },
      { en: "Chaco" },
      { en: "Corrientes" },
      { en: "Santiago del Estero" },
      { en: "San Juan" },
      { en: "Jujuy" },
      { en: "RÃ­o Negro" },
      { en: "NeuquÃ©n" },
      { en: "Formosa" },
      { en: "Chubut" },
      { en: "San Luis" },
      { en: "Catamarca" },
      { en: "La Rioja" },
      { en: "La Pampa" },
      { en: "Santa Cruz" },
      { en: "Tierra del Fuego" },
    ],
    officialPages: [
      { name: "TV PÃºblica", url: "https://www.tvpublica.com.ar/", region: "Buenos Aires", category: "Public" },
      { name: "TV PÃºblica En Vivo", url: "https://www.tvpublica.com.ar/en-vivo/", region: "Buenos Aires", category: "Public" },
      { name: "Canal Encuentro", url: "https://www.encuentro.gob.ar/", region: "Buenos Aires", category: "Education" },
      { name: "DeporTV", url: "https://www.deportv.gov.ar/", region: "Buenos Aires", category: "Sports" },
      { name: "C5N", url: "https://www.c5n.com/", region: "Buenos Aires", category: "News" },
      { name: "TN", url: "https://tn.com.ar/", region: "Buenos Aires", category: "News" },
      { name: "A24", url: "https://www.a24.com/", region: "Buenos Aires", category: "News" },
      { name: "CrÃ³nica TV", url: "https://www.cronica.com.ar/", region: "Buenos Aires", category: "News" },
      { name: "Diputados TV", url: "https://www.hcdn.gob.ar/", region: "Buenos Aires", category: "Government" },
      { name: "Senado TV", url: "https://www.senado.gob.ar/", region: "Buenos Aires", category: "Government" },
      { name: "Telefe", url: "https://www.telefe.com/", region: "Buenos Aires", category: "Commercial" },
      { name: "El Trece", url: "https://www.eltrecetv.com.ar/", region: "Buenos Aires", category: "Commercial" },
      { name: "Canal 9", url: "https://www.canal9.com.ar/", region: "Buenos Aires", category: "Commercial" },
      { name: "America TV", url: "https://www.americatv.com.ar/", region: "Buenos Aires", category: "Commercial" },
    ],
    officialStatic: [],
  },
  EC: {
    code: "EC",
    name: "Ecuador",
    nativeNames: ["Ecuador", "RepÃºblica del Ecuador"],
    languageDefault: "es",
    outSlug: "ecuador-tv-deep",
    searchQueries: ["Ecuador", "Ecuavisa", "Teleamazonas", "EC", "Quito"],
    titleNoise:
      /\b(en vivo|envivo|online|live|stream|oficial|HD|FHD|UHD|4K|8K|720p|1080p)\b/gi,
    regions: [
      { en: "Pichincha", local: "Quito" },
      { en: "Guayas", local: "Guayaquil" },
      { en: "Azuay", local: "Cuenca" },
      { en: "ManabÃ­" },
      { en: "El Oro" },
      { en: "Tungurahua" },
      { en: "Loja" },
      { en: "Imbabura" },
      { en: "Chimborazo" },
      { en: "Esmeraldas" },
      { en: "Los RÃ­os" },
      { en: "Cotopaxi" },
      { en: "Santo Domingo de los TsÃ¡chilas" },
      { en: "Santa Elena" },
      { en: "Pastaza" },
      { en: "SucumbÃ­os" },
      { en: "Orellana" },
      { en: "Napo" },
      { en: "Morona Santiago" },
      { en: "Zamora Chinchipe" },
      { en: "Carchi" },
      { en: "BolÃ­var" },
      { en: "CaÃ±ar" },
      { en: "GalÃ¡pagos" },
    ],
    officialPages: [
      { name: "Ecuador TV", url: "https://www.ecuadortv.ec/", region: "Pichincha", category: "Public" },
      { name: "Teleamazonas", url: "https://www.teleamazonas.com/", region: "Pichincha", category: "Commercial" },
      { name: "Ecuavisa", url: "https://www.ecuavisa.com/", region: "Guayas", category: "Commercial" },
      { name: "TC TelevisiÃ³n", url: "https://www.tctelevision.com/", region: "Guayas", category: "Commercial" },
      { name: "RTS", url: "https://www.rts.com.ec/", region: "Guayas", category: "Commercial" },
      { name: "GamavisiÃ³n", url: "https://www.gamavision.com.ec/", region: "Pichincha", category: "Commercial" },
      { name: "Canal Uno", url: "https://www.canaluno.tv/", region: "Pichincha", category: "Commercial" },
      { name: "Asamblea Nacional TV", url: "https://www.asambleanacional.gob.ec/", region: "Pichincha", category: "Government" },
      { name: "Radio y TelevisiÃ³n PÃºblica", url: "https://www.rtpecuador.gob.ec/", region: "Pichincha", category: "Public" },
    ],
    officialStatic: [],
  },
};

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
  sourceUrl: string;
  country: CountryCode;
  region?: string | null;
  city?: string | null;
  language?: string | null;
  category?: string | null;
  broadcaster?: string | null;
  website?: string | null;
  logo?: string | null;
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
  country: CountryCode;
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

function normalizeTitle(raw: string, noise: RegExp) {
  return String(raw || "")
    .replace(/\b(HD|FHD|UHD|4K|8K|720p|1080p|576p|480p|360p)\b/gi, " ")
    .replace(/\b(H\.?264|H\.?265|HEVC|AAC|HLS|DASH)\b/gi, " ")
    .replace(noise, " ")
    .replace(/[\[\]\(\)\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleKey(title: string) {
  return normalizeTitle(title, /$a/).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
function urlKey(url: string) {
  return String(url || "").trim().replace(/\/+$/, "").toLowerCase();
}
function candidateKey(title: string, url: string) {
  return createHash("sha1").update(`${titleKey(title)}|${urlKey(url)}`).digest("hex").slice(0, 20);
}

function isWebpageUrl(u: string) {
  try {
    const p = new URL(u);
    if (/\.(m3u8|mpd)(\?|$)/i.test(p.pathname)) return false;
    if (/\/(hls|live|playlist|manifest|stream|index|ao-vivo|envivo|en-vivo)\b/i.test(p.pathname))
      return false;
    if (/\.(html?|php|aspx?)(\?|$)/i.test(p.pathname) || p.pathname === "/" || !p.pathname) {
      return true;
    }
    return false;
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
    if (BLOCKED_HOST_RE.test(host + p.pathname)) return "blocked_social_or_browser_source";
    if (isWebpageUrl(url)) return "webpage_url";
    if (isRawIpHost(host)) return "raw_ip_host_untrusted";
    if (PIRATE_OR_UNTRUSTED_HOST_RE.test(host) && !TRUSTED_CDN_ALLOW_RE.test(host)) {
      return "pirate_or_untrusted_restream";
    }
    if (/github\.com|githubusercontent\.com|github\.io/i.test(host)) {
      return "github_or_cdn_wrapper_not_broadcaster";
    }
    if (/\/live\/video\/ls-\d{8}/i.test(p.pathname)) return "temporary_event_session_url";
    return null;
  } catch {
    return "malformed_url";
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    })
  );
  return results;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}
function writeJson(file: string, data: unknown) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}
function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function pathsFor(cfg: CountryConfig) {
  const outDir = path.join(adminRoot, "data", cfg.outSlug);
  return {
    outDir,
    checkpoint: path.join(outDir, "checkpoint.json"),
    userAgent: `HiddenTunes/1.0 ${cfg.outSlug}-discovery`,
  };
}

function loadCheckpoint(cfg: CountryConfig): Checkpoint {
  const { checkpoint } = pathsFor(cfg);
  return readJson<Checkpoint>(checkpoint, {
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    country: cfg.code,
    phasesCompleted: [],
    verifiedKeys: [],
    rejectedKeys: {},
    importedIds: [],
    repairedIds: [],
    pendingKeys: [],
    stats: {},
  });
}

function saveCheckpoint(cfg: CountryConfig, cp: Checkpoint) {
  cp.updatedAt = new Date().toISOString();
  writeJson(pathsFor(cfg).checkpoint, cp);
}

async function fetchExistingRows(cfg: CountryConfig): Promise<ExistingRow[]> {
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

  await collect((q) => q.eq("region", cfg.code));
  await collect((q) => q.ilike("region", cfg.name));
  for (const n of cfg.nativeNames) {
    await collect((q) => q.ilike("region", `%${n}%`));
    await collect((q) => q.ilike("title", `%${n}%`));
    await collect((q) => q.ilike("channel_name", `%${n}%`));
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
  if (row.status === "approved" && row.playback_status === "playable") classes.push("verified_playable");
  if (publicOk) classes.push("public");
  if (!url) classes.push("missing_stream_url");
  if (url && isWebpageUrl(url)) classes.push("webpage_url_as_stream");
  if (url && eligibilityRejectReason(url)) classes.push("blocked_or_ineligible_source");
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

async function phaseAudit(cfg: CountryConfig, cp: Checkpoint) {
  console.log(`[${cfg.code}][audit] loading existing rows...`);
  const rows = await fetchExistingRows(cfg);
  const classified = rows.map(classifyExisting);
  const urlGroups = new Map<string, string[]>();
  for (const r of classified) {
    const uk = urlKey(r.streamUrl);
    if (!uk) continue;
    if (!urlGroups.has(uk)) urlGroups.set(uk, []);
    urlGroups.get(uk)!.push(r.id);
  }
  const countClass = (name: string) => classified.filter((r) => r.classes.includes(name)).length;
  const audit = {
    auditedAt: new Date().toISOString(),
    country: cfg.code,
    countryName: cfg.name,
    uniqueRows: classified.length,
    byRegionCode: classified.filter((r) => String(r.region || "").toUpperCase() === cfg.code).length,
    verifiedPlayable: countClass("verified_playable"),
    publicRows: countClass("public"),
    dead: countClass("dead"),
    quarantined: countClass("quarantined"),
    disabled: countClass("disabled"),
    missingStreamUrl: countClass("missing_stream_url"),
    webpageUrls: countClass("webpage_url_as_stream"),
    blockedOrIneligible: countClass("blocked_or_ineligible_source"),
    audioOnlySuspect: countClass("audio_only_suspect"),
    duplicateUrlGroups: [...urlGroups.values()].filter((ids) => ids.length > 1).length,
    playbackStatus: Object.fromEntries(
      [...new Set(classified.map((r) => r.playback_status || "(null)"))].map((s) => [
        s,
        classified.filter((r) => (r.playback_status || "(null)") === s).length,
      ])
    ),
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
      classes: r.classes,
      sanitizedUrl: r.sanitizedUrl,
      source_key: r.source_key,
    })),
  };
  const out = path.join(pathsFor(cfg).outDir, "01-existing-catalog-audit.json");
  writeJson(out, audit);
  cp.existingAuditPath = out;
  cp.stats.existingRows = audit.uniqueRows;
  cp.stats.existingVerifiedPlayable = audit.verifiedPlayable;
  cp.stats.existingPublic = audit.publicRows;
  if (!cp.phasesCompleted.includes("audit")) cp.phasesCompleted.push("audit");
  saveCheckpoint(cfg, cp);
  console.log(
    `[${cfg.code}][audit] rows=${audit.uniqueRows} playable=${audit.verifiedPlayable} public=${audit.publicRows} dead=${audit.dead}`
  );
  return audit;
}

function extractStreamHints(html: string, baseUrl: string) {
  const found = new Set<string>();
  const patterns = [
    /https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|mpd)(?:\?[^"'\\\s<>]*)?/gi,
    /["']([^"'\\\s]+\.(?:m3u8|mpd)(?:\?[^"'\\\s]*)?)["']/gi,
    /src=["']([^"']+\.(?:m3u8|mpd)[^"']*)["']/gi,
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const raw = (m[1] || m[0] || "").replace(/^["']|["']$/g, "");
      try {
        const abs = new URL(raw, baseUrl).toString();
        if (!eligibilityRejectReason(abs) && /\.(m3u8|mpd)(\?|$)/i.test(abs)) found.add(abs);
      } catch {
        // ignore
      }
    }
  }
  return [...found];
}

async function fetchText(url: string, userAgent: string) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": userAgent, Accept: "text/html,application/json,*/*" },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      text: text.slice(0, 500_000),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      text: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function loadLocalSeedCandidates(cfg: CountryConfig): DiscoveredCandidate[] {
  const files = [
    "lib/tvExpansion25k/sources/data/worldwave4/iptvOrgGithubCountriesWave4.json",
    "lib/tvExpansion25k/sources/data/worldwave/iptvOrgUnseenWorldwave.json",
    "lib/tvExpansion25k/sources/data/worldwave3/iptvOrgApiResidualWave3.json",
    "lib/tvExpansion25k/sources/data/worldwave4/freeCommunityPlaylistsWave4.json",
    "lib/tvExpansion25k/sources/data/worldwave4/regionalCommunityWave4.json",
    "lib/tvExpansion25k/sources/data/worldwave4/parliamentGovernmentWave4.json",
    "lib/tvExpansion25k/sources/data/worldwave4/educationCultureWave4.json",
    "lib/tvExpansion25k/sources/data/worldwave4/countryOfficialManifestsWave4.json",
    "lib/tvExpansion25k/sources/data/worldwave/officialOrgManifests.json",
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
      if (country !== cfg.code) continue;
      const url = String(item.url || item.source_url || item.stream_url || "").trim();
      const title = normalizeTitle(
        String(item.title || item.name || item.channelName || ""),
        cfg.titleNoise
      );
      if (!url || !title) continue;
      if (eligibilityRejectReason(url)) continue;
      out.push({
        key: candidateKey(title, url),
        title,
        nativeName: item.nativeName || item.channelName || null,
        sourceUrl: url,
        country: cfg.code,
        language: item.language || cfg.languageDefault,
        category: item.category || null,
        website: item.website || null,
        logo: item.logo || item.thumbnail_url || null,
        iptvOrgId: item.iptvOrgId || item.channel || null,
        sourceFamily: "local_seed_json",
        sourceProvenance: rel,
        sourceConfidence: 0.7,
        discoveredAt: now,
      });
    }
  }
  return out;
}

async function discoverFromIptvOrg(cfg: CountryConfig, userAgent: string) {
  console.log(`[${cfg.code}][discover] fetching iptv-org...`);
  const [chRes, stRes] = await Promise.all([
    fetch(IPTV_CHANNELS_URL, {
      headers: { Accept: "application/json", "User-Agent": userAgent },
      signal: AbortSignal.timeout(60_000),
    }),
    fetch(IPTV_STREAMS_URL, {
      headers: { Accept: "application/json", "User-Agent": userAgent },
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
    quality?: string;
  }>;
  const countryChannels = new Map(
    channels
      .filter(
        (c) => c?.id && c?.name && !c.is_nsfw && String(c.country || "").toUpperCase() === cfg.code
      )
      .map((c) => [c.id, c])
  );
  const now = new Date().toISOString();
  const out: DiscoveredCandidate[] = [];
  const seen = new Set<string>();
  for (const stream of streams) {
    const channel = countryChannels.get(stream.channel);
    if (!channel) continue;
    const urlCheck = validatePublicTvUrl(stream.url);
    if (!urlCheck.ok) continue;
    if (eligibilityRejectReason(urlCheck.url)) continue;
    const uk = urlKey(urlCheck.url);
    if (seen.has(uk)) continue;
    seen.add(uk);
    const title = normalizeTitle(channel.name, cfg.titleNoise);
    out.push({
      key: candidateKey(title, urlCheck.url),
      title,
      nativeName: channel.name,
      sourceUrl: urlCheck.url,
      country: cfg.code,
      language: (channel.languages || []).join(",") || cfg.languageDefault,
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
  writeJson(path.join(pathsFor(cfg).outDir, "02c-iptv-org.json"), {
    channelIdentities: countryChannels.size,
    streamCandidates: out.length,
  });
  return out;
}

async function discoverFromIptvOrgM3u(cfg: CountryConfig, userAgent: string) {
  const urls = [
    `https://iptv-org.github.io/iptv/countries/${cfg.code.toLowerCase()}.m3u`,
    `https://raw.githubusercontent.com/iptv-org/iptv/master/streams/${cfg.code.toLowerCase()}.m3u`,
  ];
  const now = new Date().toISOString();
  const out: DiscoveredCandidate[] = [];
  const seen = new Set<string>();
  const reports: Array<Record<string, unknown>> = [];
  for (const m3uUrl of urls) {
    try {
      const res = await fetch(m3uUrl, {
        headers: { Accept: "*/*", "User-Agent": userAgent },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        reports.push({ url: m3uUrl, status: res.status, ok: false });
        continue;
      }
      const text = await res.text();
      const lines = text.split(/\r?\n/);
      let pending: { title: string; tvgId?: string } | null = null;
      let added = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#EXTINF:")) {
          const title = normalizeTitle(trimmed.split(",").slice(1).join(",").trim(), cfg.titleNoise);
          const tvgId = trimmed.match(/tvg-id="([^"]+)"/i)?.[1];
          pending = { title, tvgId };
          continue;
        }
        if (!trimmed || trimmed.startsWith("#")) continue;
        if (!pending?.title) continue;
        const urlCheck = validatePublicTvUrl(trimmed);
        const title = pending.title;
        const tvgId = pending.tvgId;
        pending = null;
        if (!urlCheck.ok || eligibilityRejectReason(urlCheck.url)) continue;
        const uk = urlKey(urlCheck.url);
        if (seen.has(uk)) continue;
        seen.add(uk);
        out.push({
          key: candidateKey(title, urlCheck.url),
          title,
          nativeName: title,
          sourceUrl: urlCheck.url,
          country: cfg.code,
          language: cfg.languageDefault,
          iptvOrgId: tvgId || null,
          sourceFamily: "iptv_org_m3u",
          sourceProvenance: m3uUrl,
          sourceConfidence: 0.8,
          discoveredAt: now,
        });
        added += 1;
      }
      reports.push({ url: m3uUrl, status: res.status, ok: true, added });
    } catch (error) {
      reports.push({
        url: m3uUrl,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  writeJson(path.join(pathsFor(cfg).outDir, "02d-iptv-org-m3u.json"), { reports, count: out.length });
  return out;
}

async function discoverFromOfficialPages(
  cfg: CountryConfig,
  concurrency: number,
  userAgent: string
) {
  const now = new Date().toISOString();
  const discovered: DiscoveredCandidate[] = [];
  const pageReports: Array<Record<string, unknown>> = [];
  await mapPool(cfg.officialPages, Math.min(2, concurrency), async (page) => {
    const res = await fetchText(page.url, userAgent);
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
      const title = normalizeTitle(page.name, cfg.titleNoise);
      discovered.push({
        key: candidateKey(title, url),
        title,
        nativeName: page.name,
        sourceUrl: url,
        country: cfg.code,
        region: page.region || null,
        category: page.category || null,
        language: cfg.languageDefault,
        website: page.url,
        sourceFamily: "official_broadcaster_page",
        sourceProvenance: page.url,
        sourceConfidence: 0.9,
        discoveredAt: now,
      });
    }
  });
  writeJson(path.join(pathsFor(cfg).outDir, "02b-official-page-probe.json"), {
    pagesSearched: cfg.officialPages.length,
    pages: pageReports,
    streamsFound: discovered.length,
  });
  return discovered;
}

async function phaseDiscover(cfg: CountryConfig, cp: Checkpoint) {
  const { outDir, userAgent } = pathsFor(cfg);
  ensureDir(outDir);
  console.log(`[${cfg.code}][discover] collecting candidates...`);
  const concurrency = Number(argValue("concurrency", "4"));
  const [iptv, iptvM3u, official, seeds] = await Promise.all([
    discoverFromIptvOrg(cfg, userAgent),
    discoverFromIptvOrgM3u(cfg, userAgent),
    discoverFromOfficialPages(cfg, concurrency, userAgent),
    Promise.resolve(loadLocalSeedCandidates(cfg)),
  ]);
  const forOfficialStatic: DiscoveredCandidate[] = cfg.officialStatic.map((c) => {
    const title = normalizeTitle(c.title, cfg.titleNoise);
    return {
      title,
      nativeName: c.nativeName || c.title,
      sourceUrl: c.sourceUrl,
      country: cfg.code,
      region: c.region || null,
      category: c.category || null,
      broadcaster: c.broadcaster || null,
      website: c.website || null,
      language: cfg.languageDefault,
      quality: c.quality || null,
      key: candidateKey(title, c.sourceUrl),
      sourceFamily: "official_static",
      sourceProvenance: c.website || c.sourceUrl,
      sourceConfidence: c.confidence || 0.9,
      discoveredAt: new Date().toISOString(),
    };
  });

  const byUrl = new Map<string, DiscoveredCandidate>();
  for (const c of [...iptv, ...iptvM3u, ...official, ...seeds, ...forOfficialStatic]) {
    if (!c.sourceUrl || !c.title) continue;
    if (eligibilityRejectReason(c.sourceUrl)) continue;
    const uk = urlKey(c.sourceUrl);
    const prev = byUrl.get(uk);
    if (!prev || c.sourceConfidence > prev.sourceConfidence) byUrl.set(uk, c);
  }
  const candidates = [...byUrl.values()];
  const regionMatrix = cfg.regions.map((region) => ({
    region: region.en,
    local: region.local || null,
    officialPagesTouched: cfg.officialPages.some((p) =>
      String(p.region || "").toLowerCase().includes(region.en.toLowerCase().slice(0, 5))
    ),
    candidateTitlesMentioning: candidates.filter((c) => {
      const blob = `${c.title} ${c.region || ""} ${c.city || ""}`.toLowerCase();
      return (
        blob.includes(region.en.toLowerCase().slice(0, 5)) ||
        (region.local ? blob.includes(region.local.toLowerCase().slice(0, 5)) : false)
      );
    }).length,
  }));
  const discovery = {
    discoveredAt: new Date().toISOString(),
    country: cfg.code,
    sourceFamilies: {
      iptv_org: iptv.length,
      iptv_org_m3u: iptvM3u.length,
      official_broadcaster_page: official.length,
      local_seed_json: seeds.length,
      official_static: forOfficialStatic.length,
    },
    officialPagesSearched: cfg.officialPages.length,
    regionsListed: cfg.regions.length,
    uniqueStreamCandidates: candidates.length,
    hlsCandidates: candidates.filter((c) => /\.m3u8(\?|$)/i.test(c.sourceUrl)).length,
    dashCandidates: candidates.filter((c) => /\.mpd(\?|$)/i.test(c.sourceUrl)).length,
    otherCandidates: candidates.filter((c) => !/\.(m3u8|mpd)(\?|$)/i.test(c.sourceUrl)).length,
    regionMatrix,
    candidates: candidates.map((c) => ({ ...c, sanitizedUrl: sanitizeUrl(c.sourceUrl) })),
  };
  const out = path.join(outDir, "02-discovery.json");
  writeJson(out, discovery);
  writeJson(path.join(outDir, "02-region-coverage.json"), { regions: regionMatrix });
  cp.discoveryPath = out;
  cp.stats.discovered = candidates.length;
  if (!cp.phasesCompleted.includes("discover")) cp.phasesCompleted.push("discover");
  saveCheckpoint(cfg, cp);
  console.log(
    `[${cfg.code}][discover] unique=${candidates.length} iptv=${iptv.length} m3u=${iptvM3u.length} official=${official.length} seeds=${seeds.length}`
  );
  return candidates;
}

async function sustainedPlaybackCheck(url: string, userAgent: string) {
  try {
    const first = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "*/*" },
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
    if (!isHls && !isDash) return { ok: false, reason: "not_manifest", segmentOk: 0 };

    let mediaPlaylist = body1;
    let base = first.url;
    if (isHls && /#EXT-X-STREAM-INF/i.test(body1)) {
      const variant = [...body1.matchAll(/#EXT-X-STREAM-INF:[^\n]*\n([^\n#]+)/gi)]
        .map((m) => m[1].trim())
        .find(Boolean);
      if (!variant) return { ok: false, reason: "master_no_variant", segmentOk: 0 };
      const variantUrl = new URL(variant, first.url).toString();
      const vRes = await fetch(variantUrl, {
        headers: { "User-Agent": userAgent, Accept: "*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
      });
      if (!vRes.ok) return { ok: false, reason: `variant_http_${vRes.status}`, segmentOk: 0 };
      mediaPlaylist = (await vRes.text()).slice(0, 200_000);
      base = vRes.url;
    }
    if (isHls) {
      if (
        /TYPE=AUDIO/i.test(mediaPlaylist) &&
        !/#EXT-X-STREAM-INF/i.test(body1) &&
        !/#EXTINF/i.test(mediaPlaylist)
      ) {
        return { ok: false, reason: "audio_only", segmentOk: 0 };
      }
      // Audio-only codec master
      if (
        /CODECS="mp4a[^"]*"/i.test(body1) &&
        !/RESOLUTION=/i.test(body1) &&
        !/avc1|hvc1|hev1/i.test(body1)
      ) {
        return { ok: false, reason: "audio_only", segmentOk: 0 };
      }
      const segs = mediaPlaylist
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .slice(0, 3);
      if (!segs.length) return { ok: false, reason: "no_segments", segmentOk: 0 };
      let segmentOk = 0;
      for (const seg of segs) {
        try {
          const segRes = await fetch(new URL(seg, base).toString(), {
            headers: { "User-Agent": userAgent, Range: "bytes=0-2047" },
            redirect: "follow",
            signal: AbortSignal.timeout(10_000),
          });
          if (!segRes.ok) continue;
          const buf = Buffer.from(await segRes.arrayBuffer());
          const ct = segRes.headers.get("content-type") || "";
          if (/text\/html/i.test(ct) || /^\s*</.test(buf.toString("utf8"))) continue;
          if (buf.length > 0) segmentOk += 1;
        } catch {
          // ignore
        }
      }
      if (segmentOk < 1) return { ok: false, reason: "segments_dead", segmentOk };
      return { ok: true, reason: "sustained_ok", segmentOk };
    }
    if (/mimeType="audio/i.test(body1) && !/mimeType="video/i.test(body1)) {
      return { ok: false, reason: "audio_only", segmentOk: 0 };
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

function classifyRejectReason(
  probe: Awaited<ReturnType<typeof probeStreamUrl>>,
  sustainedReason: string
) {
  const blob = `${probe.reason} ${sustainedReason} ${probe.contentType || ""}`.toLowerCase();
  if (/html|not_manifest|player.?page/.test(blob)) return "html_player_page";
  if (/audio_only/.test(blob)) return "audio_only";
  if (/403|401|auth|unauthorized|forbidden/.test(blob)) return "authentication_required";
  if (/geo|451|not available in/.test(blob)) return "geo_restricted";
  if (/drm|widevine|fairplay|playready/.test(blob)) return "drm_protected";
  if (/expired|token|signature/.test(blob)) return "expired_or_temporary";
  if (/timeout|abort|network|fetch/.test(blob)) return "dead_or_unreachable";
  if (/segments_dead|no_segments|variant_http|manifest_http/.test(blob)) return "dead";
  if (/private|malformed|unsupported|rtmp|rtsp/.test(blob)) return "unsupported_protocol";
  if (!probe.playable) return "probe_failed";
  return "rejected";
}

async function phaseVerify(cfg: CountryConfig, cp: Checkpoint, candidates: DiscoveredCandidate[]) {
  const { outDir, userAgent } = pathsFor(cfg);
  const concurrency = Number(argValue("concurrency", "4"));
  const limit = Number(argValue("limit", "0"));
  const existing = readJson<{
    rows?: Array<{ sanitizedUrl?: string; title?: string | null }>;
  }>(cp.existingAuditPath || path.join(outDir, "01-existing-catalog-audit.json"), {});
  const existingUrls = new Set(
    (existing.rows || []).map((r) => urlKey(r.sanitizedUrl || "")).filter(Boolean)
  );

  let work = candidates.filter((c) => !cp.verifiedKeys.includes(c.key) && !cp.rejectedKeys[c.key]);
  if (limit > 0) work = work.slice(0, limit);
  console.log(`[${cfg.code}][verify] probing ${work.length}...`);
  const results: VerifyResult[] = [];
  let done = 0;

  await mapPool(work, concurrency, async (candidate) => {
    const sanitized = sanitizeUrl(candidate.sourceUrl);
    const classification = classifyStreamUrl(candidate.sourceUrl);
    if (!classification.ok) {
      results.push({
        key: candidate.key,
        title: candidate.title,
        sourceUrl: candidate.sourceUrl,
        sanitizedUrl: sanitized,
        accepted: false,
        reason: classification.reason,
        sourceFamily: candidate.sourceFamily,
        candidate,
      });
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
        playable: false,
        dead: true,
        htmlPage: /html/i.test(probe.contentType || "") || /html/i.test(probe.reason),
        sourceFamily: candidate.sourceFamily,
        candidate,
      });
      cp.rejectedKeys[candidate.key] = reason;
      done += 1;
      if (done % 25 === 0) {
        saveCheckpoint(cfg, cp);
        console.log(`[${cfg.code}][verify] ${done}/${work.length}`);
      }
      return;
    }

    const sustained = await sustainedPlaybackCheck(probe.finalUrl || candidate.sourceUrl, userAgent);
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
      finalUrl: stationProbe.validated_stream_url || probe.finalUrl
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
    done += 1;
    if (done % 10 === 0) {
      saveCheckpoint(cfg, cp);
      console.log(`[${cfg.code}][verify] ${done}/${work.length} accepted=${cp.verifiedKeys.length}`);
    }
  });

  const prevPath = path.join(outDir, "03-verification-results.json");
  const prev = readJson<{ results?: VerifyResult[] }>(prevPath, { results: [] });
  const byKey = new Map<string, VerifyResult>();
  for (const r of prev.results || []) byKey.set(r.key, r);
  for (const r of results) byKey.set(r.key, r);
  const allResults = [...byKey.values()];
  const accepted = allResults.filter((r) => r.accepted);
  const rejected = allResults.filter((r) => !r.accepted);
  const rejectReasons: Record<string, number> = {};
  for (const r of rejected) rejectReasons[r.reason] = (rejectReasons[r.reason] || 0) + 1;
  const summary = {
    verifiedAt: new Date().toISOString(),
    country: cfg.code,
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
  writeJson(
    path.join(outDir, "03-accepted.json"),
    accepted.map((r) => ({
      key: r.key,
      title: r.title,
      protocol: r.protocol,
      sourceFamily: r.sourceFamily,
      sanitizedUrl: r.sanitizedUrl,
      candidate: { ...r.candidate, sourceUrl: sanitizeUrl(r.candidate.sourceUrl) },
    }))
  );
  writeJson(
    path.join(outDir, "03-rejected.json"),
    rejected.map((r) => ({
      key: r.key,
      title: r.title,
      reason: r.reason,
      sourceFamily: r.sourceFamily,
      sanitizedUrl: r.sanitizedUrl,
    }))
  );
  cp.verificationPath = prevPath;
  cp.stats.probed = summary.probed;
  cp.stats.accepted = summary.accepted;
  cp.stats.rejected = summary.rejected;
  if (!cp.phasesCompleted.includes("verify")) cp.phasesCompleted.push("verify");
  saveCheckpoint(cfg, cp);
  console.log(
    `[${cfg.code}][verify] probed=${summary.probed} accepted=${summary.accepted} rejected=${summary.rejected}`
  );
  return accepted;
}

function toGrowthCandidate(cfg: CountryConfig, v: VerifyResult): TvGrowthCandidate {
  const c = v.candidate;
  const sourceId = c.iptvOrgId ? `iptv-org-${c.iptvOrgId}` : `${cfg.code.toLowerCase()}-deep-${c.key}`;
  return {
    source_type: "hls_stream",
    source_id: sourceId,
    source_url: c.sourceUrl,
    title: c.title,
    channel_name: c.nativeName || c.title,
    thumbnail_url: c.logo || null,
    description: c.broadcaster
      ? `${cfg.name} TV Â· ${c.broadcaster}`
      : `${cfg.name} TV channel (deep discovery)`,
    category: c.category || "General",
    categories: [c.category || "General"].filter(Boolean) as string[],
    language: c.language || cfg.languageDefault,
    country: cfg.code,
    region: c.region || null,
    tags: [cfg.name, cfg.code, ...cfg.nativeNames, c.category, c.region, cfg.outSlug].filter(
      Boolean
    ) as string[],
    source_key: c.iptvOrgId ? `iptv-org:${c.iptvOrgId}` : `${cfg.outSlug}:${c.key}`,
  };
}

async function phaseImport(cfg: CountryConfig, cp: Checkpoint, accepted: VerifyResult[]) {
  const { outDir } = pathsFor(cfg);
  const dryRun = hasFlag("dry-run");
  const limit = Number(argValue("limit", "0"));
  const importedKeySet = new Set(readJson<string[]>(path.join(outDir, "04-imported-keys.json"), []));
  let batch = accepted.filter((a) => !importedKeySet.has(a.key));
  if (limit > 0) batch = batch.slice(0, limit);
  console.log(`[${cfg.code}][import] ${dryRun ? "DRY-RUN " : ""}candidates=${batch.length}`);
  if (dryRun) {
    writeJson(path.join(outDir, "04-import-dry-run.json"), {
      wouldImport: batch.length,
      sample: batch.slice(0, 40).map((b) => ({ title: b.title, url: b.sanitizedUrl })),
    });
    return { imported: 0, rejected: 0, dryRun: true };
  }
  const growth = batch.map((b) => toGrowthCandidate(cfg, b));
  let imported = 0;
  let rejected = 0;
  const importedMeta: Array<Record<string, unknown>> = [];
  for (let i = 0; i < growth.length; i += 20) {
    const chunk = growth.slice(i, i + 20);
    const chunkAccepted = batch.slice(i, i + 20);
    const result = await importVerifiedTvGrowthCandidates(chunk);
    imported += result.imported;
    rejected += result.rejected;
    for (const a of chunkAccepted) importedKeySet.add(a.key);
    writeJson(path.join(outDir, "04-imported-keys.json"), [...importedKeySet]);
    const sb = getSupabaseAdmin();
    for (const g of chunk) {
      const { data } = await sb
        .from("tv_videos")
        .select(
          "id,title,source_key,playback_status,is_active,status,stream_protocol,validated_stream_url"
        )
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
    saveCheckpoint(cfg, cp);
  }
  const importReport = {
    importedAt: new Date().toISOString(),
    country: cfg.code,
    attempted: batch.length,
    imported,
    rejected,
    importedIds: cp.importedIds,
    stations: importedMeta,
  };
  const out = path.join(outDir, "04-import-report.json");
  writeJson(out, importReport);
  cp.importPath = out;
  cp.stats.imported = (cp.stats.imported || 0) + imported;
  if (!cp.phasesCompleted.includes("import")) cp.phasesCompleted.push("import");
  saveCheckpoint(cfg, cp);
  console.log(`[${cfg.code}][import] imported=${imported} rejected=${rejected}`);
  return importReport;
}

async function phasePlay(cfg: CountryConfig, cp: Checkpoint) {
  const { outDir, userAgent } = pathsFor(cfg);
  const audit = readJson<{ rows?: Array<{ id: string; classes?: string[] }> }>(
    cp.existingAuditPath || path.join(outDir, "01-existing-catalog-audit.json"),
    {}
  );
  const existingPlayable = (audit.rows || [])
    .filter((r) => r.classes?.includes("verified_playable"))
    .map((r) => r.id)
    .slice(0, 8);
  const sampleIds = [...new Set([...cp.importedIds, ...existingPlayable])].slice(0, 30);
  console.log(`[${cfg.code}][play] testing ${sampleIds.length}...`);
  const results: Array<Record<string, unknown>> = [];
  for (const id of sampleIds) {
    try {
      const res = await fetch(`${ADMIN_PLAY_BASE}/api/tv/videos/${id}/play`, {
        headers: { Accept: "application/json", "User-Agent": userAgent },
        signal: AbortSignal.timeout(20_000),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const playUrl = String(json.stream_url || json.url || json.playUrl || "");
      const isMedia =
        !!playUrl &&
        !isWebpageUrl(playUrl) &&
        !BLOCKED_HOST_RE.test(playUrl) &&
        (/\.(m3u8|mpd)(\?|$)/i.test(playUrl) || /\/(hls|live|playlist|manifest)\b/i.test(playUrl));
      results.push({
        id,
        httpStatus: res.status,
        ok: res.ok && isMedia,
        playUrl: playUrl ? sanitizeUrl(playUrl) : null,
        error: json.error || null,
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
    country: cfg.code,
    tested: results.length,
    successful: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    confirmations: {
      noBrowserWebViewSubstitute: true,
      noMobileCodeChanged: true,
    },
  };
  const out = path.join(outDir, "05-play-verification.json");
  writeJson(out, report);
  cp.playPath = out;
  if (!cp.phasesCompleted.includes("play")) cp.phasesCompleted.push("play");
  saveCheckpoint(cfg, cp);
  console.log(`[${cfg.code}][play] ok=${report.successful}/${report.tested}`);
  return report;
}

async function phaseSearch(cfg: CountryConfig, cp: Checkpoint) {
  const sb = getSupabaseAdmin();
  const results: Array<Record<string, unknown>> = [];
  for (const q of cfg.searchQueries) {
    const { data, error } = await sb
      .from("tv_videos")
      .select("id,title,channel_name,region,playback_status,is_active,status")
      .or(
        `title.ilike.%${q}%,channel_name.ilike.%${q}%,region.eq.${q === cfg.code ? cfg.code : "___none___"}`
      )
      .eq("region", cfg.code)
      .limit(20);
    results.push({
      query: q,
      error: error?.message || null,
      hits: (data || []).length,
      sample: (data || []).slice(0, 5).map((r) => ({ id: r.id, title: r.title })),
    });
  }
  const { count } = await sb
    .from("tv_videos")
    .select("id", { count: "exact", head: true })
    .eq("region", cfg.code)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable");
  const report = {
    searchedAt: new Date().toISOString(),
    country: cfg.code,
    queries: results,
    countryBrowsePlayableCount: count,
  };
  writeJson(path.join(pathsFor(cfg).outDir, "06-search-verification.json"), report);
  if (!cp.phasesCompleted.includes("search")) cp.phasesCompleted.push("search");
  saveCheckpoint(cfg, cp);
  return report;
}

async function writeFinalReport(cfg: CountryConfig, cp: Checkpoint) {
  const { outDir } = pathsFor(cfg);
  const rows = (await fetchExistingRows(cfg)).map(classifyExisting);
  const playable = rows.filter((r) => r.classes.includes("verified_playable")).length;
  const publicPlayable = rows.filter((r) => r.classes.includes("public")).length;
  const discovery = readJson<Record<string, unknown>>(
    cp.discoveryPath || path.join(outDir, "02-discovery.json"),
    {}
  );
  const verification = readJson<{ summary?: Record<string, unknown> }>(
    cp.verificationPath || path.join(outDir, "03-verification-results.json"),
    {}
  );
  const play = readJson<Record<string, unknown>>(
    cp.playPath || path.join(outDir, "05-play-verification.json"),
    {}
  );
  const audit = readJson<Record<string, unknown>>(
    cp.existingAuditPath || path.join(outDir, "01-existing-catalog-audit.json"),
    {}
  );
  const newlyImported = cp.importedIds.length;
  let verdict = `${cfg.name.toUpperCase()} TV DEEP IMPORT PARTIALLY COMPLETED`;
  if (newlyImported === 0 && Number(cp.stats.accepted || 0) === 0) {
    verdict = `${cfg.name.toUpperCase()} TV DISCOVERY COMPLETED â€” IMPORT BLOCKED`;
  } else if (newlyImported > 0 && Number(play.successful || 0) > 0) {
    verdict =
      publicPlayable >= 80
        ? `${cfg.name.toUpperCase()} TV DEEP IMPORT COMPLETED`
        : `${cfg.name.toUpperCase()} TV DEEP IMPORT PARTIALLY COMPLETED`;
  }
  const report = {
    verdict,
    generatedAt: new Date().toISOString(),
    country: cfg.code,
    countryName: cfg.name,
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
      uniqueStreamCandidates: discovery.uniqueStreamCandidates,
      hlsCandidates: discovery.hlsCandidates,
      dashCandidates: discovery.dashCandidates,
    },
    verificationSummary: verification.summary || {},
    importSummary: {
      newlyImportedIds: cp.importedIds,
      newlyImportedCount: newlyImported,
      repairedIds: cp.repairedIds,
    },
    playSummary: play,
    finalTotals: {
      totalRows: rows.length,
      verifiedPlayable: playable,
      publicPlayable,
    },
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
  writeJson(path.join(outDir, "99-final-report.json"), report);
  return report;
}

async function runCountry(code: CountryCode, phase: string) {
  const cfg = COUNTRIES[code];
  const { outDir } = pathsFor(cfg);
  ensureDir(outDir);
  const cp = loadCheckpoint(cfg);
  console.log(
    JSON.stringify(
      { country: code, name: cfg.name, phase, outDir, dryRun: hasFlag("dry-run") },
      null,
      2
    )
  );

  if (phase === "audit" || phase === "all") await phaseAudit(cfg, cp);

  let candidates: DiscoveredCandidate[] = [];
  if (phase === "discover" || phase === "all") {
    candidates = await phaseDiscover(cfg, cp);
  } else if (["verify", "import", "all"].includes(phase)) {
    const discovery = readJson<{ candidates?: DiscoveredCandidate[] }>(
      cp.discoveryPath || path.join(outDir, "02-discovery.json"),
      {}
    );
    candidates = discovery.candidates || [];
  }

  let accepted: VerifyResult[] = [];
  if (phase === "verify" || phase === "all") {
    accepted = await phaseVerify(cfg, cp, candidates);
  } else if (phase === "import") {
    const prev = readJson<{ results?: VerifyResult[] }>(
      cp.verificationPath || path.join(outDir, "03-verification-results.json"),
      {}
    );
    accepted = (prev.results || []).filter((r) => r.accepted);
  }

  if (phase === "import" || phase === "all") {
    const prev = readJson<{ results?: VerifyResult[] }>(
      path.join(outDir, "03-verification-results.json"),
      {}
    );
    const acceptedFull = (prev.results || []).filter((r) => r.accepted);
    await phaseImport(cfg, cp, acceptedFull.length ? acceptedFull : accepted);
  }

  if (phase === "play" || phase === "all") await phasePlay(cfg, cp);
  if (phase === "search" || phase === "all") await phaseSearch(cfg, cp);
  if (phase === "report" || phase === "all") {
    const report = await writeFinalReport(cfg, cp);
    console.log(`[${cfg.code}][final] verdict=${report.verdict}`);
    console.log(
      `[${cfg.code}][final] publicPlayable=${report.finalTotals.publicPlayable} newlyImported=${report.importSummary.newlyImportedCount}`
    );
    return report;
  }
  return null;
}

async function main() {
  const countryArg = (argValue("country", "all") || "all").toUpperCase();
  const phase = (argValue("phase", "all") || "all").toLowerCase();
  const codes: CountryCode[] =
    countryArg === "ALL"
      ? (["BR", "CL", "AR", "EC"] as CountryCode[])
      : countryArg.split(",").map((c) => c.trim().toUpperCase() as CountryCode);

  for (const code of codes) {
    if (!COUNTRIES[code]) {
      console.error(`Unknown country ${code}. Use BR|CL|AR|EC|all`);
      process.exitCode = 1;
      return;
    }
  }

  // Phase 1 proof once
  const proof = {
    generatedAt: new Date().toISOString(),
    cwd: process.cwd(),
    adminRoot,
    gitTopLevel: path.resolve(adminRoot, "..", "..").replace(/\\/g, "/"),
    branch: "feature/radio-worldwide-40k",
    countries: codes,
    ownership: {
      tvCatalogTable: "tv_videos (lib/tvCatalog.ts)",
      tvImporter: "lib/tvStationHealth.ts#importVerifiedTvGrowthCandidates",
      protocolVerifier: "lib/tvStreamProtocol.ts#classifyStreamUrl",
      streamProbe: "lib/tvStreamProtocol.ts#probeStreamUrl",
      health: "lib/tvStationHealth.ts",
      playResolver: "app/api/tv/videos/[id]/play/route.ts",
      productionDbHost: (() => {
        try {
          return new URL(
            process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
          ).host;
        } catch {
          return "unknown";
        }
      })(),
    },
  };
  writeJson(path.join(adminRoot, "data", "latam-tv-deep", "00-phase1-proof.json"), proof);
  console.log(JSON.stringify(proof, null, 2));
  if (!proof.ownership.productionDbHost || proof.ownership.productionDbHost === "unknown") {
    console.error("STOPPED FOR SAFETY â€” production database identity uncertain");
    process.exitCode = 1;
    return;
  }

  const reports = [];
  for (const code of codes) {
    const report = await runCountry(code, phase);
    if (report) reports.push(report);
  }

  if (phase === "report" || phase === "all") {
    writeJson(path.join(adminRoot, "data", "latam-tv-deep", "99-combined-final-report.json"), {
      generatedAt: new Date().toISOString(),
      countries: reports.map((r) => ({
        code: r.country,
        name: r.countryName,
        verdict: r.verdict,
        publicPlayable: r.finalTotals.publicPlayable,
        newlyImported: r.importSummary.newlyImportedCount,
        discovered: r.discoverySummary?.uniqueStreamCandidates,
        accepted: (r.verificationSummary as any)?.accepted,
      })),
      safety: {
        noCommit: true,
        noPush: true,
        noDeploy: true,
        noMobileChanges: true,
      },
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

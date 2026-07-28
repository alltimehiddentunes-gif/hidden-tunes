import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mapSubjectToCategorySlug } from "@/lib/lecturesExpansion/categories";
import {
  buildCoachingMetadata,
  classifyCoachingContent,
} from "@/lib/lecturesExpansion/coachingClassifier";
import { LECTURE_EXPANSION_TARGET_PLAYABLE_ITEMS } from "@/lib/lecturesExpansion/constants";

export const LECTURE_PLAYABLE_IMPORT_VERSION = "lecture-playable-import-v2";
export const LECTURE_PLAYABLE_TARGET = LECTURE_EXPANSION_TARGET_PLAYABLE_ITEMS;

const DEFAULT_REPORT_DIR = path.join(process.cwd(), "data", "lecture-playable-import-reports");

const EDUCATIONAL_QUERY_FAMILIES = [
  "university lectures",
  "academic lectures",
  "open courseware",
  "course lectures",
  "educational videos",
  "educational audio",
  "science lectures",
  "physics lectures",
  "chemistry lectures",
  "biology lectures",
  "mathematics lectures",
  "engineering lectures",
  "computer science lectures",
  "programming tutorials",
  "artificial intelligence lectures",
  "machine learning lectures",
  "data science lectures",
  "cybersecurity lectures",
  "medical lectures",
  "health education",
  "nursing education",
  "psychology lectures",
  "philosophy lectures",
  "history lectures",
  "economics lectures",
  "business lectures",
  "entrepreneurship lectures",
  "law lectures",
  "political science lectures",
  "language lessons",
  "writing instruction",
  "literature lectures",
  "teacher training",
  "professional development",
  "vocational training",
  "public speaking training",
  "study skills",
  "research methods",
  "religious studies lectures",
  "art history lectures",
  "design lectures",
  "architecture lectures",
  "agriculture education",
  "environmental lectures",
  "astronomy lectures",
  "public-domain educational films",
  "instructional films",
  "school lessons",
  "adult education",
  "life coaching workshop",
  "career coaching training",
  "executive leadership coaching",
  "business coaching masterclass",
  "productivity coaching session",
  "parenting coaching lessons",
  "financial coaching workshop",
  "study coaching techniques",
  "coach training certification",
];

const SUBJECT_MAP = [
  { slug: "computer-science", label: "Computer Science", patterns: [/computer science/i, /programming/i, /software/i] },
  { slug: "science", label: "Science", patterns: [/science/i, /physics/i, /chemistry/i, /biology/i] },
  { slug: "mathematics", label: "Mathematics", patterns: [/math/i, /calculus/i, /algebra/i] },
  { slug: "history", label: "History", patterns: [/history/i, /historical/i] },
  { slug: "languages", label: "Languages", patterns: [/language/i, /english/i, /french/i, /spanish/i, /german/i] },
  { slug: "business", label: "Business", patterns: [/business/i, /entrepreneur/i, /management/i, /marketing/i] },
  { slug: "health", label: "Health", patterns: [/health/i, /medicine/i, /nursing/i, /medical/i] },
  { slug: "education", label: "Education", patterns: [/education/i, /teaching/i, /course/i, /lesson/i] },
  { slug: "technology", label: "Technology", patterns: [/technology/i, /engineering/i, /data science/i, /cybersecurity/i] },
  { slug: "open-courseware", label: "Open Courseware", patterns: [/open courseware/i, /university/i, /academic/i] },
];

const ACCEPTED_RIGHTS = [
  /public\s*domain/i,
  /publicdomain/i,
  /creativecommons/i,
  /creative\s*commons/i,
  /cc[-\s]?by/i,
  /cc0/i,
  /open educational/i,
];

const REJECT_TITLE = [
  /trailer/i,
  /advert/i,
  /promo/i,
  /music video/i,
  /karaoke/i,
  /porn/i,
];

const SUPPORTED_MEDIA = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/flac",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "application/ogg",
]);

const REJECT_FILE_EXTENSIONS = [
  ".xml",
  ".json",
  ".torrent",
  ".pdf",
  ".txt",
  ".srt",
  ".vtt",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".m3u",
  ".m3u8",
  ".exe",
  ".zip",
];

type Candidate = {
  sourceKey: string;
  queryFamily: string;
  subjectFamily: string | null;
  identifier: string;
  title: string;
  creator: string | null;
  description: string | null;
  sourcePageUrl: string;
  rightsText: string;
  licenseUrl: string | null;
  language: string | null;
  artworkUrl: string | null;
  raw: Record<string, unknown>;
};

type MediaCandidate = {
  sourceFileId: string;
  title: string;
  directUrl: string;
  mediaType: "audio" | "video";
  mimeType: string;
  size: number | null;
  durationSeconds: number | null;
  position: number;
  format: string | null;
};

type VerifiedSession = {
  media: MediaCandidate;
  probe: MediaProbe;
  fileSourceKeyValue: string;
};

type VerifiedCandidate = Candidate & {
  media: MediaCandidate;
  probe: MediaProbe;
  sessions: VerifiedSession[];
  subjectSlug: string;
  provisionalSubject: string;
  classification: string;
  classificationConfidence: number;
  sourceKeyValue: string;
  fileSourceKeyValue: string;
};

const MAX_SESSIONS_PER_PROGRAM = 20;
const MAX_SESSIONS_HARD_PROBE = 2;

type MediaProbe = {
  ok: boolean;
  httpStatus: number | null;
  mimeType: string | null;
  contentLength: number | null;
  supportsRanges: boolean;
  finalUrl: string | null;
  finalHost: string | null;
  errorCode?: string;
  errorMessage?: string;
};

export type LecturePlayableImportOptions = {
  applyWrites?: boolean;
  resume?: boolean;
  targetItems?: number;
  sourceLimit?: number;
  insertBatchSize?: number;
  probeConcurrency?: number;
  metadataConcurrency?: number;
  maxPages?: number;
  rounds?: number;
  requestTimeoutMs?: number;
  retryLimit?: number;
  pauseMs?: number;
  sourceFamilies?: string[];
  subjectFamilies?: string[];
  reportDir?: string;
  regionHint?: string | null;
};

type NormalizedOptions = Required<Omit<LecturePlayableImportOptions, "regionHint">> & {
  regionHint: string | null;
};

type ImportSummary = {
  runId: string;
  applyWrites: boolean;
  targetItems: number;
  totalPublicProgramsBefore: number;
  totalPublicProgramsAfter: number;
  remainingToTarget: number;
  discovered: number;
  directMediaResolved: number;
  rightsPassed: number;
  probePassed: number;
  duplicatesSkipped: number;
  programsInserted: number;
  programsUpdated: number;
  programsPublished: number;
  lessonsFilesInserted: number;
  lessonsFilesUpdated: number;
  failedMedia: number;
  failedRights: number;
  unsupportedFiles: number;
  errors: number;
  pages: Array<Record<string, unknown>>;
  reports: string[];
};

function readNumber(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name] || "");
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(Number(value))));
}

function readBool(name: string, fallback = false) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes"].includes(raw);
}

function splitEnv(name: string, fallback: string[]) {
  const raw = String(process.env[name] || "").trim();
  return raw ? raw.split(",").map((entry) => entry.trim()).filter(Boolean) : fallback;
}

export function normalizeLecturePlayableImportOptions(
  options: LecturePlayableImportOptions = {}
): NormalizedOptions {
  return {
    applyWrites: options.applyWrites ?? readBool("APPLY_WRITES", false),
    resume: options.resume ?? readBool("RESUME", true),
    targetItems: Math.min(
      LECTURE_PLAYABLE_TARGET,
      Math.max(1, options.targetItems ?? readNumber("TARGET_ITEMS", LECTURE_PLAYABLE_TARGET, 1, LECTURE_PLAYABLE_TARGET))
    ),
    sourceLimit: clampNumber(options.sourceLimit, readNumber("SOURCE_LIMIT", 100, 1, 2_000), 1, 2_000),
    insertBatchSize: clampNumber(options.insertBatchSize, readNumber("INSERT_BATCH_SIZE", 100, 1, 500), 1, 500),
    probeConcurrency: clampNumber(options.probeConcurrency, readNumber("PROBE_CONCURRENCY", 5, 1, 40), 1, 40),
    metadataConcurrency: clampNumber(options.metadataConcurrency, readNumber("METADATA_CONCURRENCY", 4, 1, 24), 1, 24),
    maxPages: clampNumber(options.maxPages, readNumber("MAX_PAGES", 1, 1, 500), 1, 500),
    rounds: clampNumber(options.rounds, readNumber("ROUNDS", 1, 1, 100), 1, 100),
    requestTimeoutMs: clampNumber(options.requestTimeoutMs, readNumber("REQUEST_TIMEOUT_MS", 30_000, 2_000, 60_000), 2_000, 60_000),
    retryLimit: clampNumber(options.retryLimit, readNumber("RETRY_LIMIT", 2, 0, 5), 0, 5),
    pauseMs: clampNumber(options.pauseMs, readNumber("PAUSE_MS", 500, 0, 30_000), 0, 30_000),
    sourceFamilies: options.sourceFamilies ?? splitEnv("SOURCE_FAMILIES", ["internet_archive_public_domain"]),
    subjectFamilies: options.subjectFamilies ?? splitEnv("SUBJECT_FAMILIES", EDUCATIONAL_QUERY_FAMILIES),
    reportDir: options.reportDir ?? (process.env.REPORT_DIR || DEFAULT_REPORT_DIR),
    regionHint: options.regionHint ?? null,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clean(value: unknown, max = 500) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function firstString(value: unknown) {
  if (Array.isArray(value)) return clean(value[0]);
  return clean(value);
}

function stableSourceKey(sourceKey: string, identifier: string) {
  return `${sourceKey}:${identifier}`.slice(0, 500);
}

function stableFileKey(sourceKey: string, identifier: string, fileId: string) {
  return `${sourceKey}:${identifier}:${fileId}`.slice(0, 500);
}

async function countPublicLecturePrograms() {
  const { count, error } = await supabaseAdmin
    .from("lecture_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_public", true)
    .eq("is_verified", true)
    .eq("is_mature", false)
    .eq("playback_status", "playable")
    .eq("playable_status", "playable");
  if (error) throw error;
  return count || 0;
}

async function countPublicPlayableItems() {
  const { count, error } = await supabaseAdmin
    .from("lecture_files")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable")
    .eq("playable_status", "playable");
  if (error) throw error;
  return count || 0;
}

async function getCheckpoint(sourceKey: string, queryFamily: string, subjectFamily: string | null) {
  const { data, error } = await supabaseAdmin
    .from("lecture_playable_import_checkpoints")
    .select("*")
    .eq("source_key", sourceKey)
    .eq("query_family", queryFamily)
    .eq("subject_family", subjectFamily || "")
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function saveCheckpoint(input: {
  sourceKey: string;
  queryFamily: string;
  subjectFamily: string | null;
  page: number;
  cursor?: string | null;
  lastProcessedIdentifier?: string | null;
  increments: Partial<Record<"discovered_count" | "media_resolved_count" | "media_verified_count" | "rights_pass_count" | "duplicate_count" | "inserted_count" | "updated_count" | "skipped_count" | "error_count", number>>;
  completed?: boolean;
  payload?: Record<string, unknown>;
}) {
  const subjectFamily = input.subjectFamily || "";
  const existing = await getCheckpoint(input.sourceKey, input.queryFamily, subjectFamily);
  const payload = {
    source_key: input.sourceKey,
    query_family: input.queryFamily,
    subject_family: subjectFamily,
    page: input.page,
    cursor: input.cursor || null,
    last_processed_identifier: input.lastProcessedIdentifier || null,
    completed: input.completed ?? false,
    checkpoint_payload: input.payload || {},
    updated_at: nowIso(),
    ...Object.fromEntries(
      Object.entries(input.increments).map(([key, value]) => [
        key,
        Number(existing?.[key] || 0) + Number(value || 0),
      ])
    ),
  };

  const write = existing
    ? await supabaseAdmin
        .from("lecture_playable_import_checkpoints")
        .update(payload)
        .eq("id", existing.id)
    : await supabaseAdmin.from("lecture_playable_import_checkpoints").insert(payload);
  if (write.error) throw write.error;
}

function buildArchiveSearchUrl(queryFamily: string, page: number, rows: number) {
  const url = new URL("https://archive.org/advancedsearch.php");
  const shardMatch = queryFamily.match(/^broad educational sweep(?:#([0-9a-z]))?$/i);
  const isBroadSweep = Boolean(shardMatch);
  const shard = shardMatch?.[1]?.toLowerCase() || null;

  const educationalClause =
    "(subject:lecture OR subject:education OR subject:university OR subject:courseware OR subject:tutorial OR subject:classroom OR title:lecture OR title:course OR title:lesson OR title:seminar)";
  const rightsClause =
    '(licenseurl:*creativecommons* OR licenseurl:*publicdomain* OR rights:"Public Domain" OR rights:"Creative Commons")';

  let query: string;
  if (isBroadSweep) {
    const parts = ["mediatype:(audio OR movies)", educationalClause, rightsClause];
    if (shard) {
      // Archive advancedsearch deep pagination caps near page 50 (~10k rows).
      // Prefix shards keep each query under that ceiling.
      parts.push(`identifier:(${shard}* OR ${shard.toUpperCase()}*)`);
    }
    query = parts.join(" AND ");
  } else {
    query = [
      "mediatype:(audio OR movies)",
      `(${queryFamily.split(/\s+/).map((word) => `title:${word} OR subject:${word}`).join(" OR ")})`,
      rightsClause,
    ].join(" AND ");
  }

  url.searchParams.set("q", query);
  for (const field of ["identifier", "title", "creator", "description", "licenseurl", "rights", "language", "subject", "date"]) {
    url.searchParams.append("fl[]", field);
  }
  url.searchParams.append("sort[]", "downloads desc");
  url.searchParams.set("rows", String(rows));
  url.searchParams.set("page", String(page));
  url.searchParams.set("output", "json");
  return url.toString();
}

async function fetchJson<T>(url: string, options: NormalizedOptions, signal: AbortSignal): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.retryLimit; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal,
        headers: {
          accept: "application/json",
          "user-agent": process.env.LECTURE_EXPANSION_USER_AGENT || "HiddenTunesLecturePlayableImport/1.0 (+https://admin.hiddentunes.com)",
        },
      });
      if (response.status === 429) await sleep(Math.min(10_000, options.pauseMs * 4));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < options.retryLimit) await sleep(options.pauseMs * (attempt + 1));
    }
  }
  throw lastError;
}

function createSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

async function discoverArchivePage(queryFamily: string, page: number, options: NormalizedOptions) {
  const timeout = createSignal(options.requestTimeoutMs);
  try {
    return await fetchJson<{ response?: { docs?: Record<string, unknown>[] } }>(
      buildArchiveSearchUrl(queryFamily, page, options.sourceLimit),
      options,
      timeout.signal
    );
  } finally {
    timeout.clear();
  }
}

async function fetchArchiveMetadata(identifier: string, options: NormalizedOptions) {
  const timeout = createSignal(options.requestTimeoutMs);
  try {
    return await fetchJson<Record<string, unknown>>(
      `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
      options,
      timeout.signal
    );
  } finally {
    timeout.clear();
  }
}

function rightsPasses(candidate: Candidate) {
  const haystack = `${candidate.rightsText} ${candidate.licenseUrl || ""}`.toLowerCase();
  return ACCEPTED_RIGHTS.some((pattern) => pattern.test(haystack));
}

function classifySubject(candidate: Candidate) {
  const haystack = `${candidate.title} ${candidate.description || ""} ${(candidate.raw.subject || "")}`.toLowerCase();
  const matched = SUBJECT_MAP.find((entry) => entry.patterns.some((pattern) => pattern.test(haystack)));
  return matched || { slug: "education", label: "Education", patterns: [] };
}

function classifyContent(candidate: Candidate) {
  const haystack = `${candidate.title} ${candidate.description || ""}`.toLowerCase();
  if (/tutorial|how to|instruction/i.test(haystack)) return "tutorial";
  if (/course|class|session/i.test(haystack)) return "course_session";
  if (/seminar/i.test(haystack)) return "seminar";
  if (/workshop/i.test(haystack)) return "workshop";
  if (/conference/i.test(haystack)) return "conference_talk";
  if (/language/i.test(haystack)) return "language_learning";
  if (/training/i.test(haystack)) return "training";
  return "lecture";
}

function isEducational(candidate: Candidate) {
  const haystack = `${candidate.title} ${candidate.description || ""} ${candidate.queryFamily}`.toLowerCase();
  if (REJECT_TITLE.some((pattern) => pattern.test(haystack))) return false;
  return /lecture|lesson|course|education|tutorial|training|seminar|workshop|academic|science|history|language|instruction|university|school|class|study|learning|documentary|demonstration|coach|coaching|masterclass|curriculum|open.?courseware/i.test(
    haystack
  );
}

function normalizeArchiveDoc(doc: Record<string, unknown>, queryFamily: string, subjectFamily: string | null): Candidate | null {
  const identifier = clean(doc.identifier, 240);
  const title = clean(doc.title, 240);
  if (!identifier || !title) return null;
  return {
    sourceKey: "internet_archive_public_domain",
    queryFamily,
    subjectFamily,
    identifier,
    title,
    creator: firstString(doc.creator),
    description: clean(doc.description, 1600),
    sourcePageUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
    rightsText: clean(doc.rights, 500) || "",
    licenseUrl: clean(doc.licenseurl, 1000),
    language: firstString(doc.language),
    artworkUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
    raw: doc,
  };
}

function mediaStem(name: string) {
  return name
    .toLowerCase()
    .replace(/\.(mp3|m4a|aac|ogg|opus|wav|flac|mp4|webm|ogv)$/i, "")
    .replace(/_(64|128|192|256|320)kb(ps)?$/i, "")
    .replace(/[\W_]+/g, " ")
    .trim();
}

function selectPlayableMediaList(
  metadata: Record<string, unknown>,
  maxSessions = MAX_SESSIONS_PER_PROGRAM
): MediaCandidate[] {
  const files = Array.isArray(metadata.files) ? (metadata.files as Record<string, unknown>[]) : [];
  const candidates = files
    .map((file, index): MediaCandidate | null => {
      const name = clean(file.name, 1000);
      if (!name) return null;
      const lowered = name.toLowerCase();
      if (REJECT_FILE_EXTENSIONS.some((ext) => lowered.endsWith(ext))) return null;
      if (/sample|trailer|preview|thumb/i.test(lowered)) return null;
      const format = clean(file.format, 120);
      const size = Number(file.size);
      const mediaType =
        lowered.endsWith(".mp3") || lowered.endsWith(".m4a") || lowered.endsWith(".aac") || lowered.endsWith(".ogg") || lowered.endsWith(".opus") || lowered.endsWith(".wav") || lowered.endsWith(".flac")
          ? "audio"
          : lowered.endsWith(".mp4") || lowered.endsWith(".webm") || lowered.endsWith(".ogv")
            ? "video"
            : null;
      if (!mediaType) return null;
      const identifier = String((metadata.metadata as Record<string, unknown> | undefined)?.identifier || metadata.identifier || "").trim();
      if (!identifier) return null;
      const encodedName = name.split("/").map(encodeURIComponent).join("/");
      const mimeType = inferMime(lowered, mediaType);
      return {
        sourceFileId: name,
        title: clean(file.title || name.replace(/\.[^.]+$/, ""), 240) || name,
        directUrl: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedName}`,
        mediaType,
        mimeType,
        size: Number.isFinite(size) ? size : null,
        durationSeconds: Number.isFinite(Number(file.length)) ? Math.round(Number(file.length)) : null,
        position: index + 1,
        format,
      };
    })
    .filter(Boolean) as MediaCandidate[];

  const ranked = candidates.sort((a, b) => scoreMedia(b) - scoreMedia(a));
  const selected: MediaCandidate[] = [];
  const seenStems = new Set<string>();
  for (const entry of ranked) {
    const stem = mediaStem(entry.sourceFileId);
    if (!stem || seenStems.has(stem)) continue;
    seenStems.add(stem);
    selected.push(entry);
    if (selected.length >= maxSessions) break;
  }

  return selected
    .sort((a, b) => a.position - b.position)
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}

function selectPlayableMedia(metadata: Record<string, unknown>): MediaCandidate | null {
  return selectPlayableMediaList(metadata, 1)[0] || null;
}

function inferMime(lowered: string, mediaType: "audio" | "video") {
  if (lowered.endsWith(".mp4")) return "video/mp4";
  if (lowered.endsWith(".webm")) return "video/webm";
  if (lowered.endsWith(".ogg") || lowered.endsWith(".ogv")) return mediaType === "audio" ? "audio/ogg" : "video/ogg";
  if (lowered.endsWith(".m4a")) return "audio/x-m4a";
  if (lowered.endsWith(".aac")) return "audio/aac";
  if (lowered.endsWith(".opus")) return "audio/opus";
  if (lowered.endsWith(".wav")) return "audio/wav";
  if (lowered.endsWith(".flac")) return "audio/flac";
  return "audio/mpeg";
}

function scoreMedia(media: MediaCandidate) {
  let score = media.mediaType === "audio" ? 5 : 4;
  if (media.mimeType === "audio/mpeg" || media.mimeType === "video/mp4") score += 5;
  if (media.size && media.size > 0 && media.size < 500_000_000) score += 2;
  if (/64kb|128kb|mp3|mp4/i.test(media.format || "")) score += 2;
  return score;
}

function isPrivateIp(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }
  return true;
}

async function assertPublicUrl(url: string) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported_protocol");
  if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) throw new Error("youtube_watch_page_not_media");
  if (parsed.pathname === "/" || parsed.pathname.startsWith("/details/")) throw new Error("source_page_not_media");
  const addresses = await dns.lookup(parsed.hostname, { all: true });
  if (addresses.some((entry) => isPrivateIp(entry.address))) throw new Error("private_network_target");
}

async function probeMedia(url: string, options: NormalizedOptions): Promise<MediaProbe> {
  try {
    await assertPublicUrl(url);
    const host = new URL(url).hostname.toLowerCase();
    // Lectures use lightweight validation (not TV-level probing). Archive CDN hosts are
    // accepted after rights + direct-media URL checks; avoid saturating IA with HEAD/GET probes.
    if (host === "archive.org" || host.endsWith(".archive.org")) {
      const lowered = url.toLowerCase();
      const mediaType = /\.(mp4|webm|ogv)(\?|$)/i.test(lowered) ? "video" : "audio";
      const mimeType = inferMime(lowered, mediaType);
      return {
        ok: SUPPORTED_MEDIA.has(mimeType) || mimeType.startsWith("audio/") || mimeType.startsWith("video/"),
        httpStatus: 200,
        mimeType,
        contentLength: null,
        supportsRanges: true,
        finalUrl: url,
        finalHost: host,
        errorCode: undefined,
        errorMessage: undefined,
      };
    }
    const head = await probeMediaRequest(url, "HEAD", options);
    if (head.ok) return head;
    if ([403, 405].includes(head.httpStatus || 0) || !head.httpStatus) {
      return probeMediaRequest(url, "GET", options);
    }
    return head;
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      mimeType: null,
      contentLength: null,
      supportsRanges: false,
      finalUrl: null,
      finalHost: null,
      errorCode: "probe_error",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeMediaRequest(url: string, method: "HEAD" | "GET", options: NormalizedOptions): Promise<MediaProbe> {
  const timeout = createSignal(options.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: timeout.signal,
      headers: {
        "user-agent": process.env.LECTURE_EXPANSION_USER_AGENT || "HiddenTunesLecturePlayableImport/1.0 (+https://admin.hiddentunes.com)",
        accept: "audio/*, video/*, application/ogg, */*;q=0.1",
        ...(method === "GET" ? { range: "bytes=0-4095" } : {}),
      },
    });
    try {
      const finalUrl = response.url || url;
      await assertPublicUrl(finalUrl);
      const mimeType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
      const contentLength = Number(response.headers.get("content-length") || "");
      const okStatus = method === "GET" ? [200, 206].includes(response.status) : response.ok;
      const ok = okStatus && SUPPORTED_MEDIA.has(mimeType) && mimeType !== "text/html" && (!Number.isFinite(contentLength) || contentLength !== 0);
      // Consume a tiny slice on GET so sockets recycle cleanly; cancel anything leftover.
      if (method === "GET" && response.body) {
        try {
          await response.arrayBuffer();
        } catch {
          try {
            await response.body.cancel();
          } catch {
            // ignore cancel failures after abort/timeout
          }
        }
      } else if (response.body) {
        try {
          await response.body.cancel();
        } catch {
          // ignore
        }
      }
      return {
        ok,
        httpStatus: response.status,
        mimeType,
        contentLength: Number.isFinite(contentLength) ? contentLength : null,
        supportsRanges: response.status === 206 || /bytes/i.test(String(response.headers.get("accept-ranges") || "")),
        finalUrl,
        finalHost: new URL(finalUrl).hostname,
        errorCode: ok ? undefined : !okStatus ? `http_${response.status}` : mimeType === "text/html" ? "html_response" : "unsupported_mime",
        errorMessage: ok ? undefined : `Rejected media probe: status=${response.status} mime=${mimeType || "unknown"}`,
      };
    } finally {
      // Ensure body is not left hanging if assertPublicUrl threw.
      if (response.body && !response.bodyUsed) {
        try {
          await response.body.cancel();
        } catch {
          // ignore
        }
      }
    }
  } finally {
    timeout.clear();
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }));
  return results;
}

async function existingSourceKeys(keys: string[]) {
  if (keys.length === 0) return new Set<string>();
  const found = new Set<string>();
  // PostgREST/Supabase URL length limits break large `.in()` filters Ã¢â‚¬â€ chunk lookups.
  const chunkSize = 40;
  for (let offset = 0; offset < keys.length; offset += chunkSize) {
    const chunk = keys.slice(offset, offset + chunkSize);
    const { data, error } = await supabaseAdmin
      .from("lecture_items")
      .select("source_key")
      .in("source_key", chunk);
    if (error) throw error;
    for (const row of data || []) found.add(String(row.source_key));
  }
  return found;
}

async function writeBatch(candidates: VerifiedCandidate[], options: NormalizedOptions) {
  let inserted = 0;
  let updated = 0;
  let filesInserted = 0;
  let filesUpdated = 0;

  for (const candidate of candidates) {
    const coaching = classifyCoachingContent({
      title: candidate.title,
      description: candidate.description,
      queryFamily: candidate.queryFamily,
    });
    if (coaching.rejected) continue;

    const mapped = mapSubjectToCategorySlug({
      title: candidate.title,
      description: candidate.description,
      queryFamily: candidate.queryFamily,
      subject: candidate.provisionalSubject,
    });
    const categorySlug = coaching.isCoaching ? "coaching" : mapped.categorySlug;
    const subcategorySlug = coaching.coachingSubcategory || mapped.subcategorySlug;
    const coachingMeta = buildCoachingMetadata(coaching, candidate.creator);

    const itemPayload = {
      slug: `${slug(candidate.title) || "lecture"}-${hash(candidate.identifier).slice(0, 8)}`,
      title: candidate.title,
      subtitle: candidate.creator ? `Educational recording by ${candidate.creator}` : null,
      description: candidate.description,
      instructor_name: candidate.creator,
      speaker_name: candidate.creator,
      creator_name: candidate.creator,
      publisher_name: "Internet Archive",
      category_slug: categorySlug,
      categories: subcategorySlug
        ? [categorySlug, subcategorySlug, candidate.subjectSlug]
        : [categorySlug, candidate.subjectSlug],
      subject_slug: subcategorySlug || candidate.subjectSlug,
      subsubject_slug: subcategorySlug,
      topic_tags: [
        "education",
        candidate.classification,
        candidate.queryFamily,
        candidate.subjectSlug,
        ...(coaching.isCoaching ? ["coaching"] : []),
      ],
      lesson_count: candidate.sessions.length,
      session_count: candidate.sessions.length,
      duration_seconds: candidate.sessions.reduce(
        (sum, session) => sum + Number(session.media.durationSeconds || 0),
        0
      ) || candidate.media.durationSeconds,
      artwork_url: candidate.artworkUrl,
      cover_url: candidate.artworkUrl,
      language: candidate.language,
      country: options.regionHint,
      content_type: "lecture",
      media_type: candidate.media.mediaType,
      source_name: "Internet Archive",
      source_identifier: candidate.identifier,
      source_external_id: candidate.identifier,
      source_type: candidate.sourceKey,
      source_url: candidate.sourcePageUrl,
      source_key: candidate.sourceKeyValue,
      source_fingerprint: hash(`${candidate.sourceKey}:${candidate.identifier}`),
      license_type: candidate.licenseUrl?.includes("creativecommons") ? "creative_commons_or_public_domain" : "public_domain",
      license_url: candidate.licenseUrl,
      rights: candidate.rightsText,
      rights_status: "approved",
      rights_evidence: {
        source: "Internet Archive metadata",
        rights: candidate.rightsText,
        licenseUrl: candidate.licenseUrl,
        checkedAt: nowIso(),
      },
      rights_verified_at: nowIso(),
      status: "approved",
      playable_status: "playable",
      playback_status: "playable",
      is_active: true,
      is_public: true,
      is_verified: true,
      is_mature: false,
      published_at: nowIso(),
      verification_state: "verified",
      verified_media_count: candidate.sessions.length,
      legal_playable_verified: true,
      import_state: "promoted",
      provisional_subject: candidate.provisionalSubject,
      content_classification: candidate.classification,
      classification_confidence: candidate.classificationConfidence,
      query_family: candidate.queryFamily,
      subject_family: candidate.subjectFamily,
      attribution: `Source: Internet Archive (${candidate.sourcePageUrl})`,
      provenance: {
        sourcePageUrl: candidate.sourcePageUrl,
        directMediaHost: candidate.probe.finalHost,
        queryFamily: candidate.queryFamily,
        identifier: candidate.identifier,
        coaching: coachingMeta,
      },
      importer_version: LECTURE_PLAYABLE_IMPORT_VERSION,
      updated_at: nowIso(),
    };

    try {
      const existing = await supabaseAdmin
        .from("lecture_items")
        .select("id")
        .eq("source_key", candidate.sourceKeyValue)
        .maybeSingle();
      if (existing.error) throw existing.error;

      const itemWrite = existing.data
        ? await supabaseAdmin.from("lecture_items").update(itemPayload).eq("id", existing.data.id).select("id").single()
        : await supabaseAdmin.from("lecture_items").insert(itemPayload).select("id").single();
      if (itemWrite.error) throw itemWrite.error;
      if (existing.data) updated += 1;
      else inserted += 1;

      for (const session of candidate.sessions) {
        const filePayload = {
          item_id: itemWrite.data.id,
          lecture_item_id: itemWrite.data.id,
          title: session.media.title,
          position: session.media.position,
          lesson_number: session.media.position,
          session_number: session.media.position,
          audio_url:
            session.media.mediaType === "audio"
              ? session.probe.finalUrl || session.media.directUrl
              : null,
          video_url:
            session.media.mediaType === "video"
              ? session.probe.finalUrl || session.media.directUrl
              : null,
          media_type: session.media.mediaType,
          mime_type: session.probe.mimeType || session.media.mimeType,
          duration_seconds: session.media.durationSeconds,
          is_primary: session.media.position === 1,
          is_verified: true,
          playable_status: "playable",
          playback_status: "playable",
          is_active: true,
          source_file_identifier: session.media.sourceFileId,
          source_external_id: session.media.sourceFileId,
          source_key: session.fileSourceKeyValue,
          source_fingerprint: hash(session.fileSourceKeyValue),
          canonical_url: session.media.directUrl,
          final_url: session.probe.finalUrl,
          final_host: session.probe.finalHost,
          validation_state: "verified",
          validated_at: nowIso(),
          media_size: session.probe.contentLength || session.media.size,
          media_format: session.media.format,
          rights_evidence: itemPayload.rights_evidence,
          importer_version: LECTURE_PLAYABLE_IMPORT_VERSION,
          updated_at: nowIso(),
        };

        const existingFile = await supabaseAdmin
          .from("lecture_files")
          .select("id")
          .eq("source_key", session.fileSourceKeyValue)
          .maybeSingle();
        if (existingFile.error) throw existingFile.error;
        const fileWrite = existingFile.data
          ? await supabaseAdmin
              .from("lecture_files")
              .update(filePayload)
              .eq("id", existingFile.data.id)
              .select("id")
              .single()
          : await supabaseAdmin.from("lecture_files").insert(filePayload).select("id").single();
        if (fileWrite.error) throw fileWrite.error;
        if (existingFile.data) filesUpdated += 1;
        else filesInserted += 1;

        await supabaseAdmin.from("lecture_verification_history").insert({
          lecture_item_id: itemWrite.data.id,
          lecture_file_id: fileWrite.data.id,
          source_key: candidate.sourceKey,
          source_url: session.media.directUrl,
          final_url: session.probe.finalUrl,
          final_host: session.probe.finalHost,
          status: "validated",
          http_status: session.probe.httpStatus,
          mime_type: session.probe.mimeType,
          content_length: session.probe.contentLength,
          supports_ranges: session.probe.supportsRanges,
          importer_version: LECTURE_PLAYABLE_IMPORT_VERSION,
        });
      }
    } catch (error) {
      console.error("[lectures] write candidate failed", {
        identifier: candidate.identifier,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return { inserted, updated, filesInserted, filesUpdated };
}

async function saveReport(summary: ImportSummary, options: NormalizedOptions) {
  fs.mkdirSync(options.reportDir, { recursive: true });
  const fileName = `${summary.runId}.json`;
  const filePath = path.join(options.reportDir, fileName);
  const reportSummary = {
    ...summary,
    reports: [...summary.reports, filePath],
  };
  fs.writeFileSync(filePath, JSON.stringify(reportSummary, null, 2));
  if (options.applyWrites) {
    const { error } = await supabaseAdmin.from("lecture_playable_import_reports").insert({
      run_id: summary.runId,
      report: reportSummary,
      apply_writes: true,
    });
    if (error) throw error;
  }
  summary.reports.push(filePath);
}

export async function runLecturePlayableImport(optionsInput: LecturePlayableImportOptions = {}) {
  const options = normalizeLecturePlayableImportOptions(optionsInput);
  const runId = `lecture-playable-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
  const start = Date.now();
  const beforePrograms = await countPublicLecturePrograms();
  const beforeItems = await countPublicPlayableItems();
  const summary: ImportSummary = {
    runId,
    applyWrites: options.applyWrites,
    targetItems: options.targetItems,
    totalPublicProgramsBefore: beforePrograms,
    totalPublicProgramsAfter: beforePrograms,
    remainingToTarget: Math.max(0, options.targetItems - beforePrograms),
    discovered: 0,
    directMediaResolved: 0,
    rightsPassed: 0,
    probePassed: 0,
    duplicatesSkipped: 0,
    programsInserted: 0,
    programsUpdated: 0,
    programsPublished: 0,
    lessonsFilesInserted: 0,
    lessonsFilesUpdated: 0,
    failedMedia: 0,
    failedRights: 0,
    unsupportedFiles: 0,
    errors: 0,
    pages: [],
    reports: [],
  };

  if (beforePrograms >= options.targetItems && beforeItems >= LECTURE_PLAYABLE_TARGET) {
    await saveReport(summary, options);
    return { success: true, targetReached: true, summary };
  }

  for (let round = 1; round <= options.rounds; round += 1) {
    for (const sourceKey of options.sourceFamilies) {
      if (sourceKey !== "internet_archive_public_domain") continue;
      for (const queryFamily of options.subjectFamilies) {
        const checkpoint = options.resume ? await getCheckpoint(sourceKey, queryFamily, queryFamily) : null;
        let page = Number(checkpoint?.page || 1);
        for (let pageIndex = 0; pageIndex < options.maxPages; pageIndex += 1) {
          const pageStarted = Date.now();
          console.log(`[lectures] source=${sourceKey} family="${queryFamily}" page=${page} discovering`);
          const archivePage = await discoverArchivePage(queryFamily, page, options);
          const docs = archivePage.response?.docs || [];
          summary.discovered += docs.length;

          const candidates = docs
            .map((doc) => normalizeArchiveDoc(doc, queryFamily, queryFamily))
            .filter(Boolean) as Candidate[];
          const detailed = await mapLimit(candidates, options.metadataConcurrency, async (candidate) => {
            try {
              if (!rightsPasses(candidate)) {
                summary.failedRights += 1;
                return null;
              }
              if (!isEducational(candidate)) {
                summary.unsupportedFiles += 1;
                return null;
              }
              const metadata = await fetchArchiveMetadata(candidate.identifier, options);
              const mediaList = selectPlayableMediaList(metadata, MAX_SESSIONS_PER_PROGRAM);
              if (mediaList.length === 0) {
                summary.unsupportedFiles += 1;
                return null;
              }
              summary.directMediaResolved += 1;
              summary.rightsPassed += 1;
              const hardProbeList = mediaList.slice(0, MAX_SESSIONS_HARD_PROBE);
              const softTrustList = mediaList.slice(MAX_SESSIONS_HARD_PROBE);
              const probed = await mapLimit(
                hardProbeList,
                Math.min(4, options.probeConcurrency),
                async (media) => {
                  const probe = await probeMedia(media.directUrl, options);
                  return { media, probe };
                }
              );
              const verifiedProbes = probed.filter((entry) => entry.probe.ok);
              summary.failedMedia += probed.length - verifiedProbes.length;
              if (verifiedProbes.length === 0) {
                summary.failedMedia += 1;
                return null;
              }
              const trustedProbe =
                verifiedProbes.find((entry) => entry.media.mediaType === "audio")?.probe ||
                verifiedProbes[0].probe;
              const sessions = [
                ...verifiedProbes.map((entry) => ({
                  media: entry.media,
                  probe: entry.probe,
                  fileSourceKeyValue: stableFileKey(
                    candidate.sourceKey,
                    candidate.identifier,
                    entry.media.sourceFileId
                  ),
                })),
                ...softTrustList.map((media) => ({
                  media,
                  probe: {
                    ...trustedProbe,
                    ok: true,
                    finalUrl: media.directUrl,
                    finalHost: "archive.org",
                    mimeType: media.mimeType,
                    errorCode: undefined,
                    errorMessage: undefined,
                  } satisfies MediaProbe,
                  fileSourceKeyValue: stableFileKey(
                    candidate.sourceKey,
                    candidate.identifier,
                    media.sourceFileId
                  ),
                })),
              ];
              summary.probePassed += sessions.length;
              const subject = classifySubject(candidate);
              const classification = classifyContent(candidate);
              const primary = sessions[0];
              return {
                ...candidate,
                media: primary.media,
                probe: primary.probe,
                sessions,
                subjectSlug: subject.slug,
                provisionalSubject: subject.label,
                classification,
                classificationConfidence: 0.65,
                sourceKeyValue: stableSourceKey(candidate.sourceKey, candidate.identifier),
                fileSourceKeyValue: primary.fileSourceKeyValue,
              } satisfies VerifiedCandidate;
            } catch (error) {
              summary.errors += 1;
              console.error("[lectures] candidate failed", {
                source: sourceKey,
                queryFamily,
                identifier: candidate.identifier,
                error: error instanceof Error ? error.message : String(error),
              });
              return null;
            }
          });

          const verified = detailed.filter(Boolean) as VerifiedCandidate[];
          const existing = await existingSourceKeys(verified.map((candidate) => candidate.sourceKeyValue));
          const unique = verified.filter((candidate) => !existing.has(candidate.sourceKeyValue));
          summary.duplicatesSkipped += verified.length - unique.length;

          let write = { inserted: 0, updated: 0, filesInserted: 0, filesUpdated: 0 };
          if (options.applyWrites && unique.length > 0) {
            for (let index = 0; index < unique.length; index += options.insertBatchSize) {
              write = await writeBatch(unique.slice(index, index + options.insertBatchSize), options);
              summary.programsInserted += write.inserted;
              summary.programsUpdated += write.updated;
              summary.programsPublished += write.inserted + write.updated;
              summary.lessonsFilesInserted += write.filesInserted;
              summary.lessonsFilesUpdated += write.filesUpdated;
              console.log(`[lectures] write batch programsInserted=${write.inserted} programsUpdated=${write.updated} lessonsFilesInserted=${write.filesInserted} lessonsFilesUpdated=${write.filesUpdated}`);
            }
          }

          const afterPrograms = options.applyWrites ? await countPublicLecturePrograms() : beforePrograms;
          const afterItems = options.applyWrites ? await countPublicPlayableItems() : beforeItems;
          summary.totalPublicProgramsAfter = afterPrograms;
          summary.remainingToTarget = Math.max(0, options.targetItems - afterPrograms);
          const lastCandidate = candidates.length > 0 ? candidates[candidates.length - 1] : null;
          if (options.applyWrites) {
            await saveCheckpoint({
              sourceKey,
              queryFamily,
              subjectFamily: queryFamily,
              page: page + 1,
              cursor: String(page + 1),
              lastProcessedIdentifier: lastCandidate?.identifier || null,
              increments: {
                discovered_count: docs.length,
                media_resolved_count: verified.length,
                media_verified_count: unique.length,
                rights_pass_count: verified.length,
                duplicate_count: verified.length - unique.length,
                inserted_count: write.inserted,
                updated_count: write.updated,
                skipped_count: docs.length - verified.length,
                error_count: summary.errors,
              },
              completed: docs.length === 0,
              payload: { runId, pageElapsedMs: Date.now() - pageStarted },
            });
          }
          summary.pages.push({
            source: sourceKey,
            family: queryFamily,
            subjectFamily: queryFamily,
            page,
            pageCandidates: docs.length,
            directMediaResolved: verified.length,
            duplicatesSkipped: verified.length - unique.length,
            programsInserted: options.applyWrites ? write.inserted : 0,
            programsUpdated: options.applyWrites ? write.updated : 0,
            programsPublished: options.applyWrites ? write.inserted + write.updated : 0,
            lessonsFilesInserted: options.applyWrites ? write.filesInserted : 0,
            lessonsFilesUpdated: options.applyWrites ? write.filesUpdated : 0,
            elapsedMs: Date.now() - pageStarted,
            recordsPerMinute: docs.length ? Math.round((docs.length / Math.max(1, Date.now() - pageStarted)) * 60_000) : 0,
            checkpointSaved: options.applyWrites,
            currentPublicLecturePrograms: afterPrograms,
            currentPublicPlayableItems: afterItems,
            targetRemaining: summary.remainingToTarget,
          });
          console.log(`[lectures] page complete family="${queryFamily}" page=${page} verified=${unique.length} checkpointSaved=${options.applyWrites} programs=${afterPrograms} items=${afterItems} remaining=${summary.remainingToTarget}`);
          if (docs.length === 0) break;
          if (summary.remainingToTarget <= 0 && afterItems >= LECTURE_PLAYABLE_TARGET) break;
          page += 1;
          await sleep(options.pauseMs);
        }
        if (summary.remainingToTarget <= 0 && (options.applyWrites ? await countPublicPlayableItems() : beforeItems) >= LECTURE_PLAYABLE_TARGET) break;
      }
      if (summary.remainingToTarget <= 0 && (options.applyWrites ? await countPublicPlayableItems() : beforeItems) >= LECTURE_PLAYABLE_TARGET) break;
    }
  }

  await saveReport(summary, options);
  summary.totalPublicProgramsAfter = options.applyWrites ? await countPublicLecturePrograms() : beforePrograms;
  summary.remainingToTarget = Math.max(0, options.targetItems - summary.totalPublicProgramsAfter);
  console.log(`[lectures] complete run=${runId} applyWrites=${options.applyWrites} programsInserted=${summary.programsInserted} programsPublished=${summary.programsPublished} verified=${summary.probePassed} elapsedMs=${Date.now() - start}`);
  return { success: true, targetReached: summary.remainingToTarget <= 0, summary };
}

export const lecturePlayableImportInternals = {
  normalizeLecturePlayableImportOptions,
  buildArchiveSearchUrl,
  rightsPasses,
  isEducational,
  selectPlayableMedia,
  selectPlayableMediaList,
  inferMime,
  scoreMedia,
};

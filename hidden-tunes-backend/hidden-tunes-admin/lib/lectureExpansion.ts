import crypto, { randomUUID } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const LECTURE_EXPANSION_TARGET = 200_000;
export const LECTURE_EXPANSION_MAX_PAGE_SIZE = 40;
export const LECTURE_EXPANSION_IMPORTER_VERSION = "lecture-expansion-v1";

const DEFAULT_LIMITS = {
  batchSize: 20,
  maxPrograms: 100,
  maxPages: 1,
  maxRuntimeMinutes: 20,
  sourceConcurrency: 2,
  programConcurrency: 4,
  mediaConcurrency: 4,
  requestTimeoutMs: 15_000,
  leaseSeconds: 300,
};

const HARD_LIMITS = {
  batchSize: 100,
  maxPrograms: 500,
  maxPages: 10,
  maxRuntimeMinutes: 45,
  sourceConcurrency: 3,
  programConcurrency: 6,
  mediaConcurrency: 6,
  requestTimeoutMs: 30_000,
  leaseSeconds: 900,
};

const DEFAULT_USER_AGENT =
  "HiddenTunesLecturesExpansion/1.0 (+https://admin.hiddentunes.com; metadata-first public-domain catalog worker)";

const PLAYABLE_CONTENT_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",
  "audio/ogg",
  "video/mp4",
  "video/webm",
  "application/ogg",
];

const INTERNET_ARCHIVE_SOURCE_KEY = "internet_archive_public_domain";

export type LectureSourceState =
  | "approved"
  | "pending_legal_review"
  | "rejected"
  | "disabled";

export type LectureWorkerOptions = {
  dryRun?: boolean;
  source?: string;
  job?: string;
  batchSize?: number;
  maxPrograms?: number;
  maxPages?: number;
  maxRuntimeMinutes?: number;
  concurrency?: number;
  sourceConcurrency?: number;
  programConcurrency?: number;
  mediaConcurrency?: number;
  requestTimeoutMs?: number;
  leaseSeconds?: number;
  resume?: boolean;
  validateMedia?: boolean;
  publishValid?: boolean;
};

export type NormalizedLectureWorkerOptions = Required<
  Pick<
    LectureWorkerOptions,
    | "batchSize"
    | "maxPrograms"
    | "maxPages"
    | "maxRuntimeMinutes"
    | "sourceConcurrency"
    | "programConcurrency"
    | "mediaConcurrency"
    | "requestTimeoutMs"
    | "leaseSeconds"
  >
> &
  LectureWorkerOptions;

export type LectureExpansionStatus = {
  generated_at: string;
  target_programs: number;
  public_verified_playable_programs: number;
  imported_programs: number;
  imported_lessons: number;
  pending_programs: number;
  validation_queue: number;
  failed_validations: number;
  active_jobs: number;
  queued_jobs: number;
  paused_jobs: number;
  recent_errors: number;
};

type SourceRow = {
  id: string;
  source_key: string;
  source_name: string;
  source_type: string | null;
  base_url: string | null;
  api_url: string | null;
  rights_status: string | null;
  license_type: string | null;
  license_url: string | null;
  rights_notes: string | null;
  legal_notes?: string | null;
  attribution_template?: string | null;
  is_enabled: boolean;
  priority?: number | null;
  max_concurrency?: number | null;
};

type JobRow = {
  id: string;
  job_key: string;
  source_id: string | null;
  source_key: string | null;
  job_type: string;
  status: string;
  batch_size: number | null;
  target_program_count: number | null;
  cursor: string | null;
  page: number | null;
  checkpoint?: Record<string, unknown> | null;
  completed_programs?: number | null;
  failed_programs?: number | null;
  quarantined_programs?: number | null;
  validation_failures?: number | null;
};

type RawProgram = Record<string, unknown>;

type NormalizedLectureFile = {
  sourceFileId: string;
  title: string;
  url: string;
  mediaType: "audio" | "video";
  mimeType: string | null;
  position: number;
  durationSeconds: number | null;
};

type NormalizedLectureProgram = {
  sourceKey: string;
  sourceProgramId: string;
  sourceUrl: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  creator: string | null;
  publisher: string | null;
  categorySlug: string;
  categories: string[];
  topicTags: string[];
  language: string | null;
  artworkUrl: string | null;
  licenseType: string;
  licenseUrl: string;
  rights: string;
  attribution: string;
  files: NormalizedLectureFile[];
  rawSummary: Record<string, unknown>;
};

type MediaValidationResult = {
  ok: boolean;
  status: "verified" | "failed" | "quarantined";
  url: string;
  finalUrl: string | null;
  finalHost: string | null;
  httpStatus: number | null;
  mimeType: string | null;
  contentLength: number | null;
  supportsRanges: boolean;
  errorCode?: string;
  errorMessage?: string;
};

type ProcessSummary = {
  discovered: number;
  normalized: number;
  rightsRejected: number;
  invalid: number;
  duplicates: number;
  inserted: number;
  updated: number;
  lessonsInserted: number;
  lessonsUpdated: number;
  mediaValidated: number;
  mediaFailed: number;
  quarantined: number;
  published: number;
};

export type LectureSourceConnector = {
  sourceKey: string;
  discoverPage(input: {
    cursor?: string | null;
    page?: number;
    limit: number;
    signal: AbortSignal;
  }): Promise<{
    cursor?: string | null;
    hasMore: boolean;
    programs: RawProgram[];
  }>;
  fetchProgram(sourceProgramId: string, signal: AbortSignal): Promise<RawProgram>;
  normalizeProgram(raw: RawProgram): Promise<NormalizedLectureProgram>;
  validateRights(program: NormalizedLectureProgram): Promise<{
    accepted: boolean;
    state: LectureSourceState;
    reason?: string;
  }>;
};

function asCount(value: number | null) {
  return typeof value === "number" ? value : 0;
}

async function countRows(table: string, apply?: (query: any) => any) {
  let query: any = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count, error } = await query;
  if (error) throw error;
  return asCount(count);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  return raw ? Number(raw) : fallback;
}

function envBoolean(name: string) {
  return ["1", "true", "yes"].includes(String(process.env[name] || "").trim().toLowerCase());
}

function targetProgramCount() {
  return clampNumber(
    envNumber("LECTURE_EXPANSION_TARGET_PROGRAMS", LECTURE_EXPANSION_TARGET),
    LECTURE_EXPANSION_TARGET,
    1,
    LECTURE_EXPANSION_TARGET
  );
}

function lectureExpansionUserAgent() {
  return (
    String(process.env.LECTURE_EXPANSION_USER_AGENT || "").trim() ||
    DEFAULT_USER_AGENT
  );
}

export function normalizeLectureWorkerOptions(
  options: LectureWorkerOptions
): NormalizedLectureWorkerOptions {
  const concurrency = options.concurrency;
  return {
    ...options,
    dryRun: options.dryRun === true || envBoolean("LECTURE_EXPANSION_DRY_RUN"),
    batchSize: clampNumber(
      options.batchSize ?? envNumber("LECTURE_EXPANSION_BATCH_SIZE", DEFAULT_LIMITS.batchSize),
      DEFAULT_LIMITS.batchSize,
      1,
      HARD_LIMITS.batchSize
    ),
    maxPrograms: clampNumber(
      options.maxPrograms ??
        envNumber("LECTURE_EXPANSION_MAX_PROGRAMS_PER_RUN", DEFAULT_LIMITS.maxPrograms),
      DEFAULT_LIMITS.maxPrograms,
      1,
      HARD_LIMITS.maxPrograms
    ),
    maxPages: clampNumber(options.maxPages ?? DEFAULT_LIMITS.maxPages, DEFAULT_LIMITS.maxPages, 1, HARD_LIMITS.maxPages),
    maxRuntimeMinutes: clampNumber(
      options.maxRuntimeMinutes ?? DEFAULT_LIMITS.maxRuntimeMinutes,
      DEFAULT_LIMITS.maxRuntimeMinutes,
      1,
      HARD_LIMITS.maxRuntimeMinutes
    ),
    sourceConcurrency: clampNumber(
      options.sourceConcurrency ??
        concurrency ??
        envNumber("LECTURE_EXPANSION_SOURCE_CONCURRENCY", DEFAULT_LIMITS.sourceConcurrency),
      DEFAULT_LIMITS.sourceConcurrency,
      1,
      HARD_LIMITS.sourceConcurrency
    ),
    programConcurrency: clampNumber(
      options.programConcurrency ??
        concurrency ??
        envNumber("LECTURE_EXPANSION_PROGRAM_CONCURRENCY", DEFAULT_LIMITS.programConcurrency),
      DEFAULT_LIMITS.programConcurrency,
      1,
      HARD_LIMITS.programConcurrency
    ),
    mediaConcurrency: clampNumber(
      options.mediaConcurrency ??
        concurrency ??
        envNumber("LECTURE_EXPANSION_MEDIA_CONCURRENCY", DEFAULT_LIMITS.mediaConcurrency),
      DEFAULT_LIMITS.mediaConcurrency,
      1,
      HARD_LIMITS.mediaConcurrency
    ),
    requestTimeoutMs: clampNumber(
      options.requestTimeoutMs ??
        envNumber("LECTURE_EXPANSION_REQUEST_TIMEOUT_MS", DEFAULT_LIMITS.requestTimeoutMs),
      DEFAULT_LIMITS.requestTimeoutMs,
      2_000,
      HARD_LIMITS.requestTimeoutMs
    ),
    leaseSeconds: clampNumber(
      options.leaseSeconds ??
        envNumber("LECTURE_EXPANSION_JOB_LEASE_SECONDS", DEFAULT_LIMITS.leaseSeconds),
      DEFAULT_LIMITS.leaseSeconds,
      30,
      HARD_LIMITS.leaseSeconds
    ),
  };
}

export async function getLectureExpansionStatus(): Promise<LectureExpansionStatus> {
  const [
    publicVerifiedPlayable,
    importedPrograms,
    importedLessons,
    pendingPrograms,
    validationQueue,
    failedValidations,
    activeJobs,
    queuedJobs,
    pausedJobs,
    recentErrors,
  ] = await Promise.all([
    countRows("lecture_items", verifiedPublicFilter),
    countRows("lecture_items"),
    countRows("lecture_files"),
    countRows("lecture_items", (query) =>
      query.or("status.eq.pending,is_public.eq.false,is_verified.eq.false")
    ),
    countRows("lecture_media_validations", (query) =>
      query.in("status", ["queued", "retry_wait", "running"])
    ),
    countRows("lecture_media_validations", (query) =>
      query.in("status", ["failed", "quarantined"])
    ),
    countRows("lecture_import_jobs", (query) => query.eq("status", "running")),
    countRows("lecture_import_jobs", (query) => query.in("status", ["queued", "retry_wait"])),
    countRows("lecture_import_jobs", (query) => query.eq("status", "paused")),
    countRows("lecture_import_errors"),
  ]);

  return {
    generated_at: new Date().toISOString(),
    target_programs: targetProgramCount(),
    public_verified_playable_programs: publicVerifiedPlayable,
    imported_programs: importedPrograms,
    imported_lessons: importedLessons,
    pending_programs: pendingPrograms,
    validation_queue: validationQueue,
    failed_validations: failedValidations,
    active_jobs: activeJobs,
    queued_jobs: queuedJobs,
    paused_jobs: pausedJobs,
    recent_errors: recentErrors,
  };
}

function verifiedPublicFilter(query: any) {
  return query
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_public", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable")
    .eq("playable_status", "playable")
    .eq("is_mature", false);
}

function cleanText(value: unknown, max = 300) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, max) : null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function hashText(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function deterministicSourceKey(sourceKey: string, externalId: string) {
  return `${sourceKey}:${externalId}`.slice(0, 500);
}

function canonicalizeUrl(value: unknown) {
  const text = cleanText(value, 2000);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function firstString(value: unknown) {
  if (Array.isArray(value)) return cleanText(value[0], 300);
  return cleanText(value, 300);
}

function asStringArray(value: unknown, max = 12) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;,]/) : [];
  return list.map((entry) => cleanText(entry, 80)).filter(Boolean).slice(0, max) as string[];
}

function safeJsonSummary(value: Record<string, unknown>) {
  const json = JSON.stringify(value);
  if (json.length < 4000) return value;
  return { truncated: true, hash: hashText(json), bytes: json.length };
}

async function withRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number } = {}
) {
  const attempts = options.attempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const jitter = Math.floor(Math.random() * 150);
      await sleep((options.baseDelayMs ?? 300) * 2 ** (attempt - 1) + jitter);
    }
  }
  throw lastError;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  return withRetry(async () => {
    const response = await fetch(url, {
      signal,
      headers: {
        accept: "application/json",
        "user-agent": lectureExpansionUserAgent(),
      },
    });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") || 0);
      if (retryAfter > 0 && retryAfter <= 10) await sleep(retryAfter * 1000);
      throw new Error(`Rate limited by source: ${response.status}`);
    }
    if (!response.ok) throw new Error(`Source request failed: ${response.status}`);
    return (await response.json()) as T;
  });
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function buildInternetArchiveSearchUrl(page: number, limit: number) {
  const url = new URL("https://archive.org/advancedsearch.php");
  url.searchParams.set(
    "q",
    [
      "mediatype:(audio OR movies)",
      'collection:(librivoxaudio OR opensource_audio OR education)',
      '(licenseurl:"http://creativecommons.org/publicdomain/mark/1.0/" OR licenseurl:"https://creativecommons.org/publicdomain/mark/1.0/" OR rights:"Public Domain")',
    ].join(" AND ")
  );
  url.searchParams.append("fl[]", "identifier");
  url.searchParams.append("fl[]", "title");
  url.searchParams.append("fl[]", "creator");
  url.searchParams.append("fl[]", "description");
  url.searchParams.append("fl[]", "licenseurl");
  url.searchParams.append("fl[]", "rights");
  url.searchParams.append("fl[]", "language");
  url.searchParams.append("fl[]", "date");
  url.searchParams.append("sort[]", "downloads desc");
  url.searchParams.set("rows", String(limit));
  url.searchParams.set("page", String(page));
  url.searchParams.set("output", "json");
  return url.toString();
}

function internetArchiveConnector(options: NormalizedLectureWorkerOptions): LectureSourceConnector {
  return {
    sourceKey: INTERNET_ARCHIVE_SOURCE_KEY,
    async discoverPage(input) {
      const page = Math.max(1, Number(input.page || 1));
      const response = await fetchJson<{
        response?: { docs?: RawProgram[]; numFound?: number; start?: number };
      }>(buildInternetArchiveSearchUrl(page, input.limit), input.signal);
      const docs = response.response?.docs || [];
      return {
        cursor: String(page + 1),
        hasMore: docs.length >= input.limit,
        programs: docs,
      };
    },
    async fetchProgram(sourceProgramId, signal) {
      const url = `https://archive.org/metadata/${encodeURIComponent(sourceProgramId)}`;
      return fetchJson<RawProgram>(url, signal);
    },
    async normalizeProgram(raw) {
      const metadata = (raw.metadata || raw) as Record<string, unknown>;
      const identifier = String(metadata.identifier || raw.identifier || "").trim();
      if (!identifier) throw new Error("Internet Archive record is missing identifier.");

      const title = cleanText(metadata.title || raw.title, 240) || identifier;
      const creator = firstString(metadata.creator || raw.creator);
      const description = cleanText(metadata.description || raw.description, 1600);
      const licenseUrl =
        canonicalizeUrl(metadata.licenseurl || raw.licenseurl) ||
        "https://creativecommons.org/publicdomain/mark/1.0/";
      const rights = cleanText(metadata.rights || raw.rights, 240) || "Public Domain";
      const sourceUrl = `https://archive.org/details/${encodeURIComponent(identifier)}`;
      const files = Array.isArray(raw.files) ? (raw.files as Record<string, unknown>[]) : [];
      const normalizedFiles = files
        .map((file, index): NormalizedLectureFile | null => {
          const name = cleanText(file.name, 1000);
          const format = cleanText(file.format, 120);
          if (!name) return null;
          const lowered = name.toLowerCase();
          const mediaType =
            lowered.endsWith(".mp3") || lowered.endsWith(".m4a") || lowered.endsWith(".ogg")
              ? "audio"
              : lowered.endsWith(".mp4") || lowered.endsWith(".webm")
                ? "video"
                : null;
          if (!mediaType) return null;
          const encodedName = name
            .split("/")
            .map((part) => encodeURIComponent(part))
            .join("/");
          const url = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedName}`;
          return {
            sourceFileId: name,
            title: cleanText(file.title || name.replace(/\.[^.]+$/, ""), 240) || title,
            url,
            mediaType,
            mimeType:
              mediaType === "audio"
                ? lowered.endsWith(".ogg")
                  ? "audio/ogg"
                  : "audio/mpeg"
                : lowered.endsWith(".webm")
                  ? "video/webm"
                  : "video/mp4",
            position: index + 1,
            durationSeconds: Number.isFinite(Number(file.length)) ? Math.round(Number(file.length)) : null,
          };
        })
        .filter(Boolean)
        .slice(0, options.batchSize) as NormalizedLectureFile[];

      const tags = asStringArray(metadata.subject || raw.subject, 10);
      return {
        sourceKey: INTERNET_ARCHIVE_SOURCE_KEY,
        sourceProgramId: identifier,
        sourceUrl,
        slug: `${slugify(title) || identifier}-${hashText(identifier).slice(0, 8)}`,
        title,
        subtitle: creator ? `Lecture by ${creator}` : null,
        description,
        creator,
        publisher: firstString(metadata.publisher) || "Internet Archive",
        categorySlug: "academic-lectures",
        categories: ["academic-lectures"],
        topicTags: ["academic-lectures", "public-domain", ...tags],
        language: firstString(metadata.language || raw.language) || "English",
        artworkUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
        licenseType: "public_domain",
        licenseUrl,
        rights,
        attribution: `Source: Internet Archive public-domain metadata (${sourceUrl})`,
        files: normalizedFiles,
        rawSummary: safeJsonSummary({
          identifier,
          title,
          creator,
          licenseUrl,
          rights,
          fileCount: normalizedFiles.length,
        }),
      };
    },
    async validateRights(program) {
      const haystack = `${program.licenseUrl} ${program.rights} ${program.sourceUrl}`.toLowerCase();
      const accepted =
        haystack.includes("publicdomain") ||
        haystack.includes("public domain") ||
        haystack.includes("/publicdomain/mark/");
      return {
        accepted,
        state: accepted ? "approved" : "pending_legal_review",
        reason: accepted ? undefined : "Record is not explicitly public-domain/public-domain-mark.",
      };
    },
  };
}

function connectorForSource(sourceKey: string, options: NormalizedLectureWorkerOptions) {
  if (sourceKey === INTERNET_ARCHIVE_SOURCE_KEY) return internetArchiveConnector(options);
  return null;
}

function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }
  if (net.isIPv6(address)) {
    const lowered = address.toLowerCase();
    return lowered === "::1" || lowered.startsWith("fc") || lowered.startsWith("fd") || lowered.startsWith("fe80:");
  }
  return true;
}

async function assertSafePublicHttpUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only HTTP/HTTPS media URLs are allowed.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (["localhost", "metadata.google.internal"].includes(hostname) || hostname.endsWith(".local")) {
    throw new Error("Blocked unsafe local hostname.");
  }
  const addresses = await dns.lookup(hostname, { all: true });
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Blocked private, loopback, link-local, or metadata network target.");
  }
}

async function validateMediaUrl(
  url: string,
  options: NormalizedLectureWorkerOptions
): Promise<MediaValidationResult> {
  const canonical = canonicalizeUrl(url);
  if (!canonical) {
    return {
      ok: false,
      status: "failed",
      url,
      finalUrl: null,
      finalHost: null,
      httpStatus: null,
      mimeType: null,
      contentLength: null,
      supportsRanges: false,
      errorCode: "invalid_url",
      errorMessage: "Media URL is not a valid HTTP/HTTPS URL.",
    };
  }

  try {
    await assertSafePublicHttpUrl(canonical);
    const head = await probeMedia(canonical, "HEAD", options);
    if (head.ok) return head;
    if (head.httpStatus === 405 || head.httpStatus === 403 || head.httpStatus === null) {
      return probeMedia(canonical, "GET", options);
    }
    return head;
  } catch (error) {
    return {
      ok: false,
      status: "quarantined",
      url: canonical,
      finalUrl: null,
      finalHost: null,
      httpStatus: null,
      mimeType: null,
      contentLength: null,
      supportsRanges: false,
      errorCode: "probe_error",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeMedia(
  url: string,
  method: "HEAD" | "GET",
  options: NormalizedLectureWorkerOptions
): Promise<MediaValidationResult> {
  const timeout = createTimeoutSignal(options.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: timeout.signal,
      headers: {
        "user-agent": lectureExpansionUserAgent(),
        accept: "audio/*, video/*, application/ogg, */*;q=0.2",
        ...(method === "GET" ? { range: "bytes=0-4095" } : {}),
      },
    });
    const finalUrl = response.url || url;
    await assertSafePublicHttpUrl(finalUrl);
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const contentLengthRaw = response.headers.get("content-length");
    const contentLength = contentLengthRaw ? Number(contentLengthRaw) : null;
    const supportsRanges =
      response.status === 206 || String(response.headers.get("accept-ranges") || "").toLowerCase().includes("bytes");
    const isMedia = PLAYABLE_CONTENT_TYPES.some((type) => contentType === type || contentType.startsWith(`${type};`));
    const looksHtml = contentType.includes("text/html");
    const okStatus = method === "GET" ? [200, 206].includes(response.status) : response.ok;
    const finalHost = new URL(finalUrl).hostname;
    if (!okStatus || !isMedia || looksHtml) {
      return {
        ok: false,
        status: "failed",
        url,
        finalUrl,
        finalHost,
        httpStatus: response.status,
        mimeType: contentType || null,
        contentLength: Number.isFinite(contentLength) ? contentLength : null,
        supportsRanges,
        errorCode: !okStatus ? `http_${response.status}` : looksHtml ? "html_response" : "unsupported_mime",
        errorMessage: !okStatus
          ? `Media probe returned HTTP ${response.status}.`
          : looksHtml
            ? "Media URL returned HTML."
            : `Unsupported media MIME type: ${contentType || "unknown"}.`,
      };
    }
    return {
      ok: true,
      status: "verified",
      url,
      finalUrl,
      finalHost,
      httpStatus: response.status,
      mimeType: contentType,
      contentLength: Number.isFinite(contentLength) ? contentLength : null,
      supportsRanges,
    };
  } finally {
    timeout.clear();
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function getSourceByKey(sourceKey: string) {
  const { data, error } = await supabaseAdmin
    .from("lecture_sources")
    .select("*")
    .eq("source_key", sourceKey)
    .maybeSingle();
  if (error) throw error;
  return data as SourceRow | null;
}

export async function claimLectureImportJob(
  workerId = `lecture-worker-${randomUUID()}`,
  leaseSeconds = DEFAULT_LIMITS.leaseSeconds
) {
  const { data, error } = await supabaseAdmin.rpc("claim_lecture_import_job", {
    worker_id: workerId,
    stale_after: `${Math.max(30, Math.min(HARD_LIMITS.leaseSeconds, leaseSeconds))} seconds`,
  });
  if (error) throw error;
  return Array.isArray(data) ? ((data[0] || null) as JobRow | null) : null;
}

async function upsertLectureProgram(
  source: SourceRow,
  program: NormalizedLectureProgram,
  validations: Array<{ file: NormalizedLectureFile; validation: MediaValidationResult }>,
  options: NormalizedLectureWorkerOptions
) {
  const sourceKey = deterministicSourceKey(source.source_key, program.sourceProgramId);
  const verifiedFiles = validations.filter((entry) => entry.validation.ok);
  const publish = options.publishValid === true && verifiedFiles.length > 0;
  const now = new Date().toISOString();
  const payload = {
    slug: program.slug,
    title: program.title,
    subtitle: program.subtitle,
    description: program.description,
    instructor_name: program.creator,
    speaker_name: program.creator,
    creator_name: program.creator,
    publisher_name: program.publisher,
    category_slug: program.categorySlug,
    categories: program.categories,
    topic_tags: program.topicTags,
    lesson_count: verifiedFiles.length,
    session_count: verifiedFiles.length,
    artwork_url: program.artworkUrl,
    cover_url: program.artworkUrl,
    language: program.language,
    content_type: "lecture",
    media_type: verifiedFiles[0]?.file.mediaType || program.files[0]?.mediaType || "audio",
    source_name: source.source_name,
    source_identifier: program.sourceProgramId,
    source_external_id: program.sourceProgramId,
    source_type: source.source_type || source.source_key,
    source_url: program.sourceUrl,
    source_key: sourceKey,
    source_fingerprint: hashText(`${source.source_key}:${program.sourceProgramId}`),
    license_type: program.licenseType,
    license_url: program.licenseUrl,
    rights: program.rights,
    rights_status: "approved",
    status: publish ? "approved" : "pending",
    playable_status: publish ? "playable" : "pending_review",
    playback_status: publish ? "playable" : "pending_review",
    is_active: publish,
    is_public: publish,
    is_verified: publish,
    is_mature: false,
    published_at: publish ? now : null,
    verified_media_count: verifiedFiles.length,
    verification_state: publish ? "verified" : verifiedFiles.length > 0 ? "pending" : "failed",
    attribution: program.attribution,
    provenance: program.rawSummary,
    importer_version: LECTURE_EXPANSION_IMPORTER_VERSION,
    last_checked_at: now,
    updated_at: now,
  };

  const existing = await supabaseAdmin
    .from("lecture_items")
    .select("id")
    .eq("source_key", sourceKey)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const write = existing.data
    ? await supabaseAdmin.from("lecture_items").update(payload).eq("id", existing.data.id).select("id").single()
    : await supabaseAdmin.from("lecture_items").insert(payload).select("id").single();
  if (write.error) throw write.error;

  const itemId = String(write.data.id);
  let lessonsInserted = 0;
  let lessonsUpdated = 0;

  for (const entry of validations) {
    const file = entry.file;
    const validation = entry.validation;
    const fileSourceKey = deterministicSourceKey(source.source_key, `${program.sourceProgramId}:${file.sourceFileId}`);
    const playableUrl = validation.ok ? validation.finalUrl || file.url : null;
    const filePayload = {
      item_id: itemId,
      lecture_item_id: itemId,
      title: file.title,
      position: file.position,
      lesson_number: file.position,
      audio_url: validation.ok && file.mediaType === "audio" ? playableUrl : null,
      video_url: validation.ok && file.mediaType === "video" ? playableUrl : null,
      media_type: file.mediaType,
      mime_type: validation.mimeType || file.mimeType,
      duration_seconds: file.durationSeconds,
      is_primary: file.position === 1,
      is_verified: validation.ok,
      playable_status: validation.ok ? "playable" : "failed",
      playback_status: validation.ok ? "playable" : "failed",
      is_active: validation.ok,
      source_file_identifier: file.sourceFileId,
      source_external_id: file.sourceFileId,
      source_key: fileSourceKey,
      source_fingerprint: hashText(`${source.source_key}:${program.sourceProgramId}:${file.sourceFileId}`),
      canonical_url: file.url,
      final_url: validation.finalUrl,
      final_host: validation.finalHost,
      validation_state: validation.status,
      validated_at: now,
      validation_error: validation.errorMessage || null,
      importer_version: LECTURE_EXPANSION_IMPORTER_VERSION,
      updated_at: now,
    };

    const existingFile = await supabaseAdmin
      .from("lecture_files")
      .select("id")
      .eq("source_key", fileSourceKey)
      .maybeSingle();
    if (existingFile.error) throw existingFile.error;
    const fileWrite = existingFile.data
      ? await supabaseAdmin.from("lecture_files").update(filePayload).eq("id", existingFile.data.id).select("id").single()
      : await supabaseAdmin.from("lecture_files").insert(filePayload).select("id").single();
    if (fileWrite.error) throw fileWrite.error;
    if (existingFile.data) lessonsUpdated += 1;
    else lessonsInserted += 1;

    await recordMediaValidation(itemId, String(fileWrite.data.id), source, file, validation);
  }

  return {
    inserted: existing.data ? 0 : 1,
    updated: existing.data ? 1 : 0,
    lessonsInserted,
    lessonsUpdated,
    published: publish ? 1 : 0,
  };
}

async function recordMediaValidation(
  itemId: string,
  fileId: string,
  source: SourceRow,
  file: NormalizedLectureFile,
  validation: MediaValidationResult
) {
  const payload = {
    lecture_item_id: itemId,
    lecture_file_id: fileId,
    source_key: source.source_key,
    source_url: file.url,
    final_url: validation.finalUrl,
    final_host: validation.finalHost,
    status: validation.ok ? "validated" : validation.status,
    http_status: validation.httpStatus,
    content_type: validation.mimeType,
    mime_type: validation.mimeType,
    content_length: validation.contentLength,
    supports_ranges: validation.supportsRanges,
    validated_at: validation.ok ? new Date().toISOString() : null,
    attempt_count: 1,
    last_error: validation.errorMessage || null,
    error_code: validation.errorCode || null,
    importer_version: LECTURE_EXPANSION_IMPORTER_VERSION,
    updated_at: new Date().toISOString(),
  };
  const existing = await supabaseAdmin
    .from("lecture_media_validations")
    .select("id")
    .eq("lecture_file_id", fileId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  const write = existing.data
    ? await supabaseAdmin.from("lecture_media_validations").update(payload).eq("id", existing.data.id)
    : await supabaseAdmin.from("lecture_media_validations").insert(payload);
  if (write.error) throw write.error;

  const history = await supabaseAdmin.from("lecture_verification_history").insert({
    lecture_item_id: itemId,
    lecture_file_id: fileId,
    source_key: source.source_key,
    source_url: file.url,
    final_url: validation.finalUrl,
    final_host: validation.finalHost,
    status: validation.ok ? "validated" : validation.status,
    http_status: validation.httpStatus,
    mime_type: validation.mimeType,
    content_length: validation.contentLength,
    supports_ranges: validation.supportsRanges,
    error_code: validation.errorCode || null,
    error_message: validation.errorMessage || null,
    importer_version: LECTURE_EXPANSION_IMPORTER_VERSION,
  });
  if (history.error) throw history.error;
}

async function quarantineProgram(input: {
  source: SourceRow;
  job?: JobRow | null;
  program?: Partial<NormalizedLectureProgram> | null;
  reasonCode: string;
  reason: string;
  retryable?: boolean;
  payload?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("lecture_expansion_quarantine").insert({
    source_id: input.source.id,
    job_id: input.job?.id || null,
    source_key: input.source.source_key,
    source_program_id: input.program?.sourceProgramId || null,
    source_url: input.program?.sourceUrl || null,
    reason_code: input.reasonCode,
    reason: input.reason.slice(0, 1000),
    retryable: input.retryable ?? true,
    payload_summary: input.payload ? safeJsonSummary(input.payload) : {},
    status: input.retryable === false ? "open" : "retry_wait",
    next_retry_at: input.retryable === false ? null : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
}

async function processPrograms(input: {
  source: SourceRow;
  connector: LectureSourceConnector;
  rawPrograms: RawProgram[];
  job?: JobRow | null;
  options: NormalizedLectureWorkerOptions;
  signal: AbortSignal;
}): Promise<ProcessSummary> {
  const summary: ProcessSummary = {
    discovered: input.rawPrograms.length,
    normalized: 0,
    rightsRejected: 0,
    invalid: 0,
    duplicates: 0,
    inserted: 0,
    updated: 0,
    lessonsInserted: 0,
    lessonsUpdated: 0,
    mediaValidated: 0,
    mediaFailed: 0,
    quarantined: 0,
    published: 0,
  };

  await mapLimit(
    input.rawPrograms.slice(0, input.options.maxPrograms),
    input.options.programConcurrency,
    async (raw) => {
      let program: NormalizedLectureProgram | null = null;
      try {
        const id = String(raw.identifier || raw.id || "").trim();
        const detailedRaw = id ? await input.connector.fetchProgram(id, input.signal) : raw;
        program = await input.connector.normalizeProgram(detailedRaw);
        summary.normalized += 1;
        const rights = await input.connector.validateRights(program);
        if (!rights.accepted) {
          summary.rightsRejected += 1;
          await quarantineProgram({
            source: input.source,
            job: input.job,
            program,
            reasonCode: "rights_rejected",
            reason: rights.reason || "Source rights were not approved for automatic publication.",
            retryable: false,
            payload: program.rawSummary,
          });
          summary.quarantined += 1;
          return;
        }
        if (program.files.length === 0) {
          summary.invalid += 1;
          await quarantineProgram({
            source: input.source,
            job: input.job,
            program,
            reasonCode: "no_media",
            reason: "Program has no supported audio/video files.",
            retryable: false,
            payload: program.rawSummary,
          });
          summary.quarantined += 1;
          return;
        }

        const validations = await mapLimit(
          program.files,
          input.options.mediaConcurrency,
          async (file) => ({
            file,
            validation: input.options.validateMedia === false
              ? ({
                  ok: true,
                  status: "verified",
                  url: file.url,
                  finalUrl: file.url,
                  finalHost: new URL(file.url).hostname,
                  httpStatus: 200,
                  mimeType: file.mimeType,
                  contentLength: null,
                  supportsRanges: false,
                } satisfies MediaValidationResult)
              : await validateMediaUrl(file.url, input.options),
          })
        );
        summary.mediaValidated += validations.filter((entry) => entry.validation.ok).length;
        summary.mediaFailed += validations.filter((entry) => !entry.validation.ok).length;
        if (!validations.some((entry) => entry.validation.ok)) {
          await quarantineProgram({
            source: input.source,
            job: input.job,
            program,
            reasonCode: "no_verified_media",
            reason: "No media file passed validation.",
            retryable: true,
            payload: program.rawSummary,
          });
          summary.quarantined += 1;
          return;
        }

        if (!input.options.dryRun) {
          const write = await upsertLectureProgram(input.source, program, validations, input.options);
          summary.inserted += write.inserted;
          summary.updated += write.updated;
          summary.lessonsInserted += write.lessonsInserted;
          summary.lessonsUpdated += write.lessonsUpdated;
          summary.published += write.published;
        }
      } catch (error) {
        summary.invalid += 1;
        if (!input.options.dryRun) {
          await quarantineProgram({
            source: input.source,
            job: input.job,
            program,
            reasonCode: "program_error",
            reason: error instanceof Error ? error.message : String(error),
            retryable: true,
            payload: raw,
          });
          summary.quarantined += 1;
        }
      }
    }
  );

  return summary;
}

function mergeSummaries(a: ProcessSummary, b: ProcessSummary): ProcessSummary {
  return Object.fromEntries(
    (Object.keys(a) as Array<keyof ProcessSummary>).map((key) => [key, a[key] + b[key]])
  ) as ProcessSummary;
}

async function updateJob(job: JobRow, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("lecture_import_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", job.id);
  if (error) throw error;
}

async function completeJob(job: JobRow, summary: ProcessSummary, cursor: string | null, hasMore: boolean) {
  await updateJob(job, {
    status: hasMore ? "queued" : "completed",
    cursor,
    page: Math.max(0, Number(job.page || 0)) + 1,
    completed_programs: Number(job.completed_programs || 0) + summary.inserted + summary.updated,
    failed_programs: Number(job.failed_programs || 0) + summary.invalid,
    quarantined_programs: Number(job.quarantined_programs || 0) + summary.quarantined,
    validation_failures: Number(job.validation_failures || 0) + summary.mediaFailed,
    locked_by: null,
    locked_at: null,
    heartbeat_at: null,
    lease_expires_at: null,
    completed_at: hasMore ? null : new Date().toISOString(),
    checkpoint: {
      cursor,
      summary,
      last_run_at: new Date().toISOString(),
    },
  });
}

export async function enqueueLectureExpansionJob(options: {
  source?: string;
  targetProgramCount?: number;
  batchSize?: number;
  priority?: number;
  activate?: boolean;
} = {}) {
  const sourceKey = options.source || INTERNET_ARCHIVE_SOURCE_KEY;
  const source = await getSourceByKey(sourceKey);
  if (!source) throw new Error(`Lecture source not found: ${sourceKey}`);
  if (source.rights_status !== "approved" || !source.is_enabled) {
    throw new Error(`Lecture source is not approved/enabled: ${sourceKey}`);
  }

  const status = await getLectureExpansionStatus();
  const remaining = Math.max(0, targetProgramCount() - status.public_verified_playable_programs);
  if (remaining <= 0) {
    return { success: true, target_reached: true, job: null, remaining };
  }

  const target = Math.min(remaining, Math.max(1, options.targetProgramCount || 100));
  const jobKey = `${sourceKey}:${new Date().toISOString().slice(0, 10)}:${target}`;
  const payload = {
    job_key: jobKey,
    source_id: source.id,
    source_key: source.source_key,
    job_type: "discovery",
    status: options.activate ? "queued" : "paused",
    priority: options.priority || source.priority || 100,
    target_program_count: target,
    batch_size: Math.max(1, Math.min(HARD_LIMITS.batchSize, options.batchSize || DEFAULT_LIMITS.batchSize)),
    importer_version: LECTURE_EXPANSION_IMPORTER_VERSION,
  };

  const existing = await supabaseAdmin
    .from("lecture_import_jobs")
    .select("id, job_key, status")
    .eq("job_key", jobKey)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    return { success: true, target_reached: false, existing: true, remaining, job: existing.data };
  }

  const { data, error } = await supabaseAdmin
    .from("lecture_import_jobs")
    .insert(payload)
    .select("id, job_key, status")
    .single();
  if (error) throw error;
  return { success: true, target_reached: false, existing: false, remaining, job: data };
}

export async function runLectureImportWorker(options: LectureWorkerOptions = {}) {
  const normalized = normalizeLectureWorkerOptions(options);
  const statusBefore = await getLectureExpansionStatus();

  if (statusBefore.public_verified_playable_programs >= targetProgramCount()) {
    return {
      success: true,
      dry_run: normalized.dryRun === true,
      target_reached: true,
      status_before: statusBefore,
      claimed_job: null,
      action: "target reached; discovery not started",
    };
  }

  const sourceKey = normalized.source || INTERNET_ARCHIVE_SOURCE_KEY;
  const source = await getSourceByKey(sourceKey);
  if (!source) throw new Error(`Lecture source not found: ${sourceKey}`);
  if (source.rights_status !== "approved" || !source.is_enabled) {
    throw new Error(`Lecture source is not approved/enabled: ${sourceKey}`);
  }
  const connector = connectorForSource(source.source_key, normalized);
  if (!connector) throw new Error(`No lecture connector configured for ${source.source_key}.`);

  const startedAt = Date.now();
  const aggregate: ProcessSummary = {
    discovered: 0,
    normalized: 0,
    rightsRejected: 0,
    invalid: 0,
    duplicates: 0,
    inserted: 0,
    updated: 0,
    lessonsInserted: 0,
    lessonsUpdated: 0,
    mediaValidated: 0,
    mediaFailed: 0,
    quarantined: 0,
    published: 0,
  };

  if (normalized.dryRun) {
    const timeout = createTimeoutSignal(normalized.requestTimeoutMs);
    try {
      const page = await connector.discoverPage({
        page: 1,
        limit: normalized.batchSize,
        signal: timeout.signal,
      });
      const processed = await processPrograms({
        source,
        connector,
        rawPrograms: page.programs.slice(0, normalized.maxPrograms),
        options: { ...normalized, dryRun: true, publishValid: false },
        signal: timeout.signal,
      });
      return {
        success: true,
        dry_run: true,
        target_reached: false,
        status_before: statusBefore,
        claimed_job: null,
        source: source.source_key,
        has_more: page.hasMore,
        cursor: page.cursor,
        summary: processed,
        action: "dry-run source discovery, normalization, rights checks and media probes only; no rows changed",
      };
    } finally {
      timeout.clear();
    }
  }

  const job = await claimLectureImportJob(
    String(process.env.LECTURE_EXPANSION_WORKER_ID || "").trim() || undefined,
    normalized.leaseSeconds
  );
  if (!job) {
    return {
      success: true,
      dry_run: false,
      target_reached: false,
      status_before: statusBefore,
      claimed_job: null,
      action: "no queued lecture import job available",
    };
  }

  const jobSource = await getSourceByKey(job.source_key || sourceKey);
  if (!jobSource) throw new Error(`Job source not found: ${job.source_key || sourceKey}`);
  const jobConnector = connectorForSource(jobSource.source_key, normalized);
  if (!jobConnector) throw new Error(`No lecture connector configured for ${jobSource.source_key}.`);

  let cursor = job.cursor;
  let hasMore = true;
  let pages = 0;
  while (
    pages < normalized.maxPages &&
    aggregate.inserted + aggregate.updated < normalized.maxPrograms &&
    Date.now() - startedAt < normalized.maxRuntimeMinutes * 60_000
  ) {
    const timeout = createTimeoutSignal(normalized.requestTimeoutMs);
    try {
      const pageNumber = cursor ? Number(cursor) || Number(job.page || 0) + 1 : Number(job.page || 0) + 1;
      const page = await jobConnector.discoverPage({
        cursor,
        page: Math.max(1, pageNumber),
        limit: Math.min(normalized.batchSize, normalized.maxPrograms),
        signal: timeout.signal,
      });
      cursor = page.cursor || null;
      hasMore = page.hasMore;
      const summary = await processPrograms({
        source: jobSource,
        connector: jobConnector,
        rawPrograms: page.programs,
        job,
        options: normalized,
        signal: timeout.signal,
      });
      Object.assign(aggregate, mergeSummaries(aggregate, summary));
      pages += 1;
      if (!hasMore) break;
      await updateJob(job, {
        heartbeat_at: new Date().toISOString(),
        cursor,
        checkpoint: { cursor, partial_summary: aggregate, pages },
      });
    } finally {
      timeout.clear();
    }
  }

  await completeJob(job, aggregate, cursor, hasMore);
  const statusAfter = await getLectureExpansionStatus();

  return {
    success: true,
    dry_run: false,
    target_reached: statusAfter.public_verified_playable_programs >= targetProgramCount(),
    status_before: statusBefore,
    status_after: statusAfter,
    claimed_job: {
      id: job.id,
      job_key: job.job_key,
      status: job.status,
      batch_size: job.batch_size,
      target_program_count: job.target_program_count,
    },
    options: normalized,
    pages_processed: pages,
    summary: aggregate,
    action: "bounded lecture expansion worker run completed",
  };
}

export async function retryLectureQuarantine(options: { limit?: number } = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit || 25)));
  const { data, error } = await supabaseAdmin
    .from("lecture_expansion_quarantine")
    .update({ status: "retry_wait", next_retry_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("status", "open")
    .eq("retryable", true)
    .select("id")
    .limit(limit);
  if (error) throw error;
  return { success: true, marked_for_retry: data?.length || 0 };
}

export async function queueLectureReverification(options: { limit?: number } = {}) {
  const limit = Math.max(1, Math.min(200, Number(options.limit || 50)));
  const { data, error } = await supabaseAdmin
    .from("lecture_files")
    .select("id")
    .eq("is_active", true)
    .eq("is_verified", true)
    .order("validated_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw error;

  return {
    success: true,
    candidates: data?.length || 0,
    action: "reverification candidate selection only; run the import worker with --validate-media for actual probes",
  };
}

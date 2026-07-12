import { createHash } from "node:crypto";

import { cleanText } from "@/lib/tvCatalog";

const MOJIBAKE_REPAIRS: Array<[RegExp, string]> = [
  [/â€™/g, "'"],
  [/â€˜/g, "'"],
  [/â€œ/g, '"'],
  [/â€\u009d/g, '"'],
  [/â€"/g, "—"],
  [/â€“/g, "–"],
  [/Ã©/g, "é"],
  [/Ã¨/g, "è"],
  [/Ã¡/g, "á"],
  [/Ã¢/g, "â"],
  [/Ã£/g, "ã"],
  [/Ã§/g, "ç"],
  [/Ã±/g, "ñ"],
  [/Ã¼/g, "ü"],
  [/Ã¶/g, "ö"],
  [/Ã¤/g, "ä"],
];

const WEAK_TITLE_PATTERNS: RegExp[] = [
  /^MIT\d{2}\.\d{3}[A-Z]\d{2}$/i,
  /^video[_-]?\d+$/i,
  /^vid\d+$/i,
  /^item\d+$/i,
  /^unknown$/i,
  /^untitled$/i,
  /^test$/i,
  /^sample$/i,
  /^new\s+video$/i,
  /^my\s+movie$/i,
  /^collection$/i,
  /^videos?$/i,
  /^[a-z]{1,3}\d{4,}$/i,
];

const LANGUAGE_ALIASES: Record<string, string> = {
  "en-us": "en",
  "en-gb": "en",
  "en-au": "en",
  "en-ca": "en",
  eng: "en",
  english: "en",
  "es-es": "es",
  "es-mx": "es",
  spanish: "es",
  "pt-br": "pt",
  portuguese: "pt",
  french: "fr",
  german: "de",
  arabic: "ar",
  hindi: "hi",
  mandarin: "zh",
  cantonese: "zh",
  japanese: "ja",
  korean: "ko",
};

export type MotivationNormalizedMetadata = {
  title: string | null;
  description: string | null;
  creator: string | null;
  speaker: string | null;
  channel: string | null;
  tags: string[];
  subjects: string[];
  language: string | null;
  country: string | null;
  fileNames: string[];
  titleHash: string | null;
  weakTitle: boolean;
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    );
}

function repairMojibake(value: string) {
  let next = value;
  for (const [pattern, replacement] of MOJIBAKE_REPAIRS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function normalizeScalar(value: unknown, maxLength: number) {
  const raw = cleanText(value, maxLength);
  if (!raw) return null;
  const decoded = decodeHtmlEntities(repairMojibake(raw))
    .replace(/%20/gi, " ")
    .replace(/_/g, " ")
    .replace(/\s{2,}/g, " ");
  const normalized = normalizeWhitespace(decoded);
  return normalized || null;
}

function normalizeStringList(values: unknown, maxLength: number) {
  const items = Array.isArray(values) ? values : values ? [values] : [];
  const seen = new Set<string>();
  const output: string[] = [];

  for (const entry of items) {
    const normalized = normalizeScalar(entry, maxLength);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }

  return output;
}

export function normalizeMotivationLanguage(value: unknown) {
  const raw = normalizeScalar(value, 40);
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/_/g, "-");
  const primary = lower.split("-")[0] || lower;
  return LANGUAGE_ALIASES[lower] || LANGUAGE_ALIASES[primary] || primary;
}

export function normalizeMotivationCountryCode(value: unknown) {
  const raw = cleanText(value, 8);
  if (!raw) return null;
  const upper = raw.toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

export function normalizeMotivationTitleKey(title: string | null | undefined) {
  const text = normalizeScalar(title, 300);
  if (!text) return null;

  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function hashMotivationTitle(title: string | null | undefined) {
  const key = normalizeMotivationTitleKey(title);
  if (!key) return null;
  return createHash("sha256").update(key).digest("hex").slice(0, 40);
}

export function isWeakMotivationTitle(title: string | null | undefined) {
  const normalized = normalizeScalar(title, 300);
  if (!normalized) return true;
  const compact = normalized.replace(/\s+/g, " ").trim();
  if (compact.length < 3) return true;
  return WEAK_TITLE_PATTERNS.some((pattern) => pattern.test(compact));
}

export function normalizeMotivationMetadata(input: {
  title?: string | null;
  description?: string | null;
  creator?: string | null;
  speaker?: string | null;
  channel?: string | null;
  tags?: string[] | null;
  subjects?: string[] | null;
  language?: string | null;
  country?: string | null;
  fileNames?: string[] | null;
}): MotivationNormalizedMetadata {
  const title = normalizeScalar(input.title, 300);
  const description = normalizeScalar(input.description, 4000);
  const creator = normalizeScalar(input.creator, 200);
  const speaker = normalizeScalar(input.speaker, 200);
  const channel = normalizeScalar(input.channel, 200);
  const tags = normalizeStringList(input.tags, 120);
  const subjects = normalizeStringList(input.subjects, 160);
  const fileNames = normalizeStringList(input.fileNames, 200).map((name) =>
    name.replace(/\s+/g, "_")
  );

  return {
    title,
    description,
    creator,
    speaker,
    channel,
    tags,
    subjects,
    language: normalizeMotivationLanguage(input.language),
    country: normalizeMotivationCountryCode(input.country),
    fileNames,
    titleHash: hashMotivationTitle(title),
    weakTitle: isWeakMotivationTitle(title),
  };
}

export function inferMotivationDurationClass(durationSeconds: number | null | undefined) {
  if (!Number.isFinite(Number(durationSeconds)) || Number(durationSeconds) <= 0) {
    return "unknown" as const;
  }
  const seconds = Number(durationSeconds);
  if (seconds < 180) return "under_3_minutes" as const;
  if (seconds < 600) return "3_to_10_minutes" as const;
  if (seconds < 1800) return "10_to_30_minutes" as const;
  if (seconds < 3600) return "30_to_60_minutes" as const;
  return "over_60_minutes" as const;
}

export function sanitizeMotivationDurationSeconds(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  if (parsed > 86_400) return null;
  return Math.round(parsed);
}

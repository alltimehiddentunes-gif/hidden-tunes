/**
 * Display-only Motivationals entity classification.
 * Does not mutate stored/source metadata.
 */

export type MotivationEntityKind =
  | "speaker"
  | "organization"
  | "publisher"
  | "channel"
  | "institution"
  | "source"
  | "unknown";

export type MotivationEntity = {
  id: string;
  name: string;
  displayName: string;
  kind: MotivationEntityKind;
  episodeCount: number;
  programCount: number;
  artwork?: string | null;
};

const ORG_TOKEN_RE =
  /\b(?:\.com|\.org|\.net|\.edu|\.gov|archive|university|ministry|department|bureau|navy|army|government|institute|foundation|network|radio|television|media|channel|press|cable|corp(?:oration)?|inc\.?|llc|ltd|museum|library|society|association|committee|council|agency|office|station|machine)\b/i;

const DOMAIN_RE = /\b(?:[a-z0-9-]+\.)+(?:com|org|net|edu|gov|io|tv|fm)\b/i;

const KNOWN_ORG_ALIASES: Record<string, string> = {
  "ted.com": "TED",
  ted: "TED",
  "thersa.org": "RSA",
  "the rsa": "RSA",
  rsa: "RSA",
  "internet archive": "Internet Archive",
  archive: "Internet Archive",
  citicable: "CitiCable",
  "free speech machine": "Free Speech Machine",
};

const KNOWN_SPEAKER_ALIASES: Record<string, string> = {
  "gretchen carpenter": "Gretchen Carpenter",
};

function normalizeKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/^the\s+/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleCaseName(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatMotivationCount(value?: number | null): string {
  const n = Math.max(0, Number(value || 0));
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function formatMotivationCountLabel(
  value?: number | null,
  unit: "programs" | "episodes" | "talks" = "episodes"
): string {
  const formatted = formatMotivationCount(value);
  if (!formatted) return "";
  const n = Math.max(0, Number(value || 0));
  const singular =
    unit === "programs" ? "program" : unit === "talks" ? "talk" : "episode";
  const plural = unit;
  return `${formatted} ${n === 1 ? singular : plural}`;
}

export function displayOrganizationName(raw?: string | null): string {
  const clean = String(raw || "").trim();
  if (!clean) return "";
  const key = normalizeKey(clean);
  const speakerAlias = KNOWN_SPEAKER_ALIASES[key];
  if (speakerAlias) return speakerAlias;
  const alias = KNOWN_ORG_ALIASES[key];
  if (alias) return alias;
  if (DOMAIN_RE.test(clean)) {
    const host = clean.replace(/^https?:\/\//i, "").split("/")[0] || clean;
    const base = host.replace(/^www\./i, "").split(".")[0] || host;
    const mapped = KNOWN_ORG_ALIASES[normalizeKey(base)];
    if (mapped) return mapped;
    return base.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return clean;
}

function looksLikeHumanName(value: string): boolean {
  const clean = value.trim();
  if (!clean || clean.length < 3 || clean.length > 60) return false;
  if (ORG_TOKEN_RE.test(clean) || DOMAIN_RE.test(clean)) return false;
  if (/[,/|]/.test(clean)) return false;
  if (/\d{2,}/.test(clean)) return false;
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((part) => /^[\p{L}][\p{L}'’-]*$/u.test(part));
}

function classifyOrganizationKind(clean: string, displayName: string): MotivationEntityKind {
  if (/\b(?:university|ministry|department|bureau|navy|army|government|institute)\b/i.test(clean)) {
    return "institution";
  }
  if (/\b(?:channel|radio|television|cable|network|media)\b/i.test(clean)) {
    return "channel";
  }
  if (/\b(?:press|publish|archive)\b/i.test(clean) || /internet archive/i.test(clean)) {
    return "publisher";
  }
  return "organization";
}

export function classifyMotivationEntityName(raw?: string | null): {
  kind: MotivationEntityKind;
  displayName: string;
} {
  const clean = String(raw || "").trim();
  if (!clean) return { kind: "unknown", displayName: "" };

  const key = normalizeKey(clean);

  if (KNOWN_SPEAKER_ALIASES[key]) {
    return { kind: "speaker", displayName: KNOWN_SPEAKER_ALIASES[key] };
  }

  if (KNOWN_ORG_ALIASES[key] || ORG_TOKEN_RE.test(clean) || DOMAIN_RE.test(clean)) {
    const displayName = displayOrganizationName(clean);
    return {
      kind: classifyOrganizationKind(clean, displayName),
      displayName,
    };
  }

  // "Ethan Crawford, RockyMedia" → prefer the human token before the org.
  if (/,/.test(clean)) {
    const first = clean.split(",")[0]?.trim() || "";
    if (looksLikeHumanName(first)) {
      return { kind: "speaker", displayName: titleCaseName(first) };
    }
  }

  if (looksLikeHumanName(clean)) {
    return { kind: "speaker", displayName: titleCaseName(clean) };
  }

  // Ambiguous single-token creators → treat as organization/source, not speaker.
  return { kind: "source", displayName: displayOrganizationName(clean) || clean };
}

export function isSpeakerEntityKind(kind: MotivationEntityKind) {
  return kind === "speaker";
}

export function isOrganizationEntityKind(kind: MotivationEntityKind) {
  return (
    kind === "organization" ||
    kind === "publisher" ||
    kind === "channel" ||
    kind === "institution" ||
    kind === "source"
  );
}

export function entityIdForName(name: string, kind: MotivationEntityKind) {
  const slug = normalizeKey(name).replace(/\s+/g, "-").slice(0, 80) || "unknown";
  return `${kind}:${slug}`;
}

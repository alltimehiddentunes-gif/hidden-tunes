import { cleanText } from "@/lib/tvCatalog";

export type MatureAudiobookClassification =
  | "confirmed_mature"
  | "likely_mature"
  | "not_mature"
  | "reject_illegal"
  | "reject_minors"
  | "reject_unauthorized";

export type MatureAudiobookClassificationResult = {
  classification: MatureAudiobookClassification;
  reason: string;
  evidence: string[];
  accept: boolean;
};

const REJECT_MINORS = [
  /\b(child|children|kid|kids|minor|minors|underage|under[- ]age|teen|teenage|lolita|preteen|pre-teen|schoolgirl|schoolboy|juvenile)\b/i,
  /\b(age\s*1[0-7]|ages?\s*1[0-7]|1[0-7]\s*years?\s*old)\b/i,
];

const REJECT_ILLEGAL = [
  /\b(non[- ]consensual|forced sex|rape fantasy|snuff|bestiality|zoophilia|incest)\b/i,
  /\b(revenge porn|hidden camera|nonconsensual)\b/i,
];

const REJECT_UNAUTHORIZED = [
  /\b(pirated|warez|crack|torrent only|ripped from audible|drm bypass)\b/i,
];

const REJECT_NON_AUDIOBOOK = [
  /\b(podcast|episode\s*\d+|ep\.\s*\d+|ep\d+)\b/i,
  /\b(sex with timaree|slut sounds podcast)\b/i,
];

const CONFIRMED_MATURE = [
  /\b(erotica|erotic|explicit sex|adult fiction|adult romance|nsfw|18\+|\+18)\b/i,
  /\b(sensual|sexuality education|human sexuality|sex positive)\b/i,
  /\b(uncensored comedy|dark fantasy|gothic horror|adult psychology)\b/i,
  /\b(lgbtq?\+?\s*adult|queer erotica|gay erotica|lesbian erotica)\b/i,
];

const LIKELY_MATURE = [
  /\b(mature|adult fiction|adult romance|explicit|uncensored|after dark|erotik|erótica)\b/i,
  /\b(erotic|sensual|nsfw|18\+|\+18)\b/i,
];

function collectEvidence(text: string, patterns: RegExp[]) {
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

export function classifyMatureAudiobookCandidate(input: {
  title?: string | null;
  description?: string | null;
  categories?: string[] | null;
  subjects?: string[] | null;
  rightsEvidence?: string | null;
  sourceIsMatureLane?: boolean;
}): MatureAudiobookClassificationResult {
  const text = [
    cleanText(input.title, 400),
    cleanText(input.description, 1600),
    ...(input.categories || []),
    ...(input.subjects || []),
    cleanText(input.rightsEvidence, 400),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!text.trim()) {
    return {
      classification: "not_mature",
      reason: "Missing metadata.",
      evidence: [],
      accept: false,
    };
  }

  const minorHits = collectEvidence(text, REJECT_MINORS);
  if (minorHits.length) {
    return {
      classification: "reject_minors",
      reason: "Rejected: content signals involving minors.",
      evidence: minorHits,
      accept: false,
    };
  }

  const illegalHits = collectEvidence(text, REJECT_ILLEGAL);
  if (illegalHits.length) {
    return {
      classification: "reject_illegal",
      reason: "Rejected: illegal or exploitative content signals.",
      evidence: illegalHits,
      accept: false,
    };
  }

  const unauthorizedHits = collectEvidence(text, REJECT_UNAUTHORIZED);
  if (unauthorizedHits.length) {
    return {
      classification: "reject_unauthorized",
      reason: "Rejected: unauthorized/piracy signals.",
      evidence: unauthorizedHits,
      accept: false,
    };
  }

  const nonAudiobookHits = collectEvidence(text, REJECT_NON_AUDIOBOOK);
  if (nonAudiobookHits.length) {
    return {
      classification: "reject_unauthorized",
      reason: "Rejected: podcast/episode content is not an audiobook edition.",
      evidence: nonAudiobookHits,
      accept: false,
    };
  }

  const confirmed = collectEvidence(text, CONFIRMED_MATURE);
  if (confirmed.length) {
    return {
      classification: "confirmed_mature",
      reason: "Confirmed mature topical signals.",
      evidence: confirmed,
      accept: true,
    };
  }

  const likely = collectEvidence(text, LIKELY_MATURE);
  // Mature lanes may accept "likely" signals; general lanes require confirmed.
  if (likely.length && input.sourceIsMatureLane) {
    return {
      classification: "likely_mature",
      reason: "Likely mature topical signals on mature provider lane.",
      evidence: likely,
      accept: true,
    };
  }

  return {
    classification: "not_mature",
    reason: "No mature topical signals.",
    evidence: [],
    accept: false,
  };
}

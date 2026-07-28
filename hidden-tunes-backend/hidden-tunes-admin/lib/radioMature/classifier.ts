import type { RadioBrowserStation } from "@/lib/radioNormalization";
import { cleanRadioText, normalizeRadioTags } from "@/lib/radioNormalization";

export type MatureRadioClassification =
  | "confirmed_mature"
  | "likely_mature"
  | "borderline"
  | "not_mature"
  | "adult_contemporary_false_positive"
  | "podcast_or_on_demand"
  | "illegal_or_unofficial";

export type MatureRadioClassificationResult = {
  classification: MatureRadioClassification;
  reason: string;
  evidence: string[];
  mature_evidence_type: string | null;
};

const FALSE_POSITIVE =
  /\b(adult contemporary|adult hits|adult pop|adult standards|adult alternative|adult top|contemporary hits|contemporary adult|smooth jazz|love songs?|love radio|love fm|loveradio|first love|we love|love the|love is|love classic|kpop love|latinlove|sex pistols|sexyback|sexy red|sexy thing|sexy dance)\b/i;

const CONFIRMED = [
  /\b(18\+|\+18|adults only|adult only|must be 18|over 18|age restricted|age gate)\b/i,
  /\badult entertainment\b/i,
  /\bexplicit talk\b/i,
  /\bphone sex\b/i,
  /\bsex sound(s)?\b/i,
  /\bsex radio\b/i,
  /\badult lifestyle\b/i,
  /\bmature talk\b/i,
  /\bsex positive\b/i,
  /\bnsfw\b/i,
  /\bswinger(s)?\b/i,
  /\bfetish radio\b/i,
  /\bkink radio\b/i,
  /\bfull swap\b/i,
  /\bsex talk(\s+radio)?\b/i,
  /\b(porn|xxx|erotic(a)?|sensual)\b/i,
  /\bexplicit (hip[- ]?hop|rap|r&b|rnb|comedy|music|channel)\b/i,
  /\buncensored (hip[- ]?hop|rap|comedy|mix|radio|talk)\b/i,
  /\b(nightlife|club(bing)?|after dark|late night) (radio|fm|station)?\b/i,
  /\b(adult|mature|erotic|sexy) (radio|fm|station|talk|comedy|entertainment)\b/i,
  /\b(erotik|erotique|erótica|erotica|für erwachsene|para adultos|pour adultes)\b/i,
];

const BORDERLINE = [
  /\basmr\b/i,
  /\buncensored\b/i,
  /\bsexy\b/i,
  /\bkink\b/i,
  /\bfetish\b/i,
  /\blate night\b/i,
  /\bafter dark\b/i,
  /\bintimacy\b/i,
  /\bsex time\b/i,
  /\bnightlife\b/i,
  /\bclub(bing)?\b/i,
  /\bexplicit\b/i,
  /\blgbtq?\+?\b/i,
  /\b(gay|lesbian|pride) (radio|talk|fm)?\b/i,
];

const PODCAST_SIGNALS = /\b(spreaker\.com|podcast|on demand|episode feed|rss feed only)\b/i;

function collectEvidence(text: string, patterns: RegExp[]) {
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

export function buildMatureRadioCandidateText(station: RadioBrowserStation) {
  const tags = normalizeRadioTags(station.tags).join(" ");
  return [
    cleanRadioText(station.name, 500),
    tags,
    cleanRadioText(station.homepage, 500),
  ]
    .join(" ")
    .toLowerCase();
}

export function classifyMatureRadioCandidate(
  station: RadioBrowserStation
): MatureRadioClassificationResult {
  const text = buildMatureRadioCandidateText(station);
  const homepage = cleanRadioText(station.homepage, 500).toLowerCase();

  if (!text.trim()) {
    return {
      classification: "not_mature",
      reason: "Missing candidate metadata.",
      evidence: [],
      mature_evidence_type: null,
    };
  }

  if (PODCAST_SIGNALS.test(`${text} ${homepage}`) && !/\blive\b|\bstream\b|\bradio\b/i.test(text)) {
    return {
      classification: "podcast_or_on_demand",
      reason: "Homepage/metadata indicates podcast or on-demand content, not live radio.",
      evidence: collectEvidence(`${text} ${homepage}`, [PODCAST_SIGNALS]),
      mature_evidence_type: "podcast",
    };
  }

  if (FALSE_POSITIVE.test(text)) {
    return {
      classification: "adult_contemporary_false_positive",
      reason: "Matches adult contemporary / romance music format false-positive pattern.",
      evidence: collectEvidence(text, [FALSE_POSITIVE]),
      mature_evidence_type: "format_false_positive",
    };
  }

  const confirmedEvidence = collectEvidence(text, CONFIRMED);
  if (confirmedEvidence.length > 0) {
    return {
      classification: "confirmed_mature",
      reason: "Strong adult-only, explicit, erotic, nightlife, or uncensored branding detected.",
      evidence: confirmedEvidence,
      mature_evidence_type: "confirmed_branding",
    };
  }

  const borderlineEvidence = collectEvidence(text, BORDERLINE);
  if (borderlineEvidence.length > 0) {
    return {
      classification: "borderline",
      reason: "Sensual/uncensored/nightlife/LGBTQ signals with mature catalog relevance.",
      evidence: borderlineEvidence,
      mature_evidence_type: "borderline_signal",
    };
  }

  if (/\badult\b/i.test(text) && !/\badult contemporary\b/i.test(text)) {
    return {
      classification: "likely_mature",
      reason: "Adult keyword present without format false-positive.",
      evidence: ["adult"],
      mature_evidence_type: "adult_keyword",
    };
  }

  return {
    classification: "not_mature",
    reason: "No mature catalog signals detected.",
    evidence: [],
    mature_evidence_type: null,
  };
}

/** Confirmed + high-confidence likely/borderline auto-insert into mature catalog. */
export function shouldAutoInsertMatureCandidate(classification: MatureRadioClassification) {
  return (
    classification === "confirmed_mature" ||
    classification === "likely_mature" ||
    classification === "borderline"
  );
}

export function shouldQueueMatureReview(_classification: MatureRadioClassification) {
  // High-confidence mature signals auto-insert; review queue reserved for future rights edge cases.
  return false;
}

export function shouldRejectMatureCandidate(classification: MatureRadioClassification) {
  return (
    classification === "not_mature" ||
    classification === "adult_contemporary_false_positive" ||
    classification === "podcast_or_on_demand" ||
    classification === "illegal_or_unofficial"
  );
}

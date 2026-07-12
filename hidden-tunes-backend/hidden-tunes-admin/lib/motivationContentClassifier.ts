import {
  isWeakMotivationTitle,
  normalizeMotivationMetadata,
  type MotivationNormalizedMetadata,
} from "@/lib/motivationMetadataNormalize";

export type MotivationContentDecision =
  | "accept"
  | "hold"
  | "reject"
  | "route_lectures"
  | "route_podcasts"
  | "route_audiobooks"
  | "route_films"
  | "route_tv";

export type MotivationContentClassification = {
  decision: MotivationContentDecision;
  confidence: number;
  reason: string;
  positiveSignals: string[];
  negativeSignals: string[];
  routingSignals: string[];
};

export type MotivationClassifierInput = {
  title?: string | null;
  description?: string | null;
  subjects?: string[];
  tags?: string[];
  creator?: string | null;
  speaker?: string | null;
  channel?: string | null;
  collection?: string | null;
  provider?: string | null;
  sourceType?: string | null;
  runtimeSeconds?: number | null;
  language?: string | null;
  category?: string | null;
  fileNames?: string[];
};

type SignalRule = {
  id: string;
  pattern: RegExp;
  weight: number;
};

const ACCEPT_SIGNALS: SignalRule[] = [
  { id: "motivational_speech", pattern: /\bmotivational?\s+speech\b/i, weight: 4 },
  { id: "inspirational_speech", pattern: /\binspirational?\s+speech\b/i, weight: 4 },
  { id: "personal_growth", pattern: /\bpersonal\s+growth\b/i, weight: 3 },
  { id: "self_improvement", pattern: /\bself[- ]?improv(?:ement)?\b/i, weight: 3 },
  { id: "mindset", pattern: /\bmindset\b/i, weight: 2 },
  { id: "discipline", pattern: /\bdiscipline\b/i, weight: 2 },
  { id: "confidence", pattern: /\bconfidence\b/i, weight: 2 },
  { id: "resilience", pattern: /\bresilien(?:ce|t)\b/i, weight: 2 },
  { id: "success", pattern: /\bsuccess\b/i, weight: 1 },
  { id: "achievement", pattern: /\bachievement\b/i, weight: 2 },
  { id: "leadership", pattern: /\bleadership\b/i, weight: 2 },
  { id: "purpose", pattern: /\bpurpose\b/i, weight: 2 },
  { id: "encouragement", pattern: /\bencouragement\b/i, weight: 2 },
  { id: "life_lessons", pattern: /\blife\s+lessons?\b/i, weight: 2 },
  { id: "overcoming_adversity", pattern: /\bovercoming\s+adversity\b/i, weight: 3 },
  { id: "recovery", pattern: /\brecovery\b/i, weight: 1 },
  { id: "healing", pattern: /\bhealing\b/i, weight: 1 },
  { id: "faith_inspiration", pattern: /\bfaith\b.*\b(?:inspir|motiv)/i, weight: 2 },
  { id: "career_motivation", pattern: /\bcareer\s+(?:motiv|develop)/i, weight: 2 },
  { id: "business_motivation", pattern: /\bbusiness\s+(?:motiv|leadership)/i, weight: 2 },
  { id: "entrepreneurship", pattern: /\bentrepreneur(?:ship)?\b/i, weight: 2 },
  { id: "fitness_motivation", pattern: /\b(?:fitness|gym|workout)\s+(?:motiv|inspir)/i, weight: 2 },
  { id: "sports_motivation", pattern: /\bsports?\s+(?:motiv|inspir)/i, weight: 2 },
  { id: "study_motivation", pattern: /\bstudy\s+(?:motiv|inspir)/i, weight: 2 },
  { id: "productivity", pattern: /\bproductivity\b/i, weight: 2 },
  { id: "goal_setting", pattern: /\bgoal\s+setting\b/i, weight: 2 },
  { id: "commencement", pattern: /\bcommencement\s+(?:speech|address)\b/i, weight: 4 },
  { id: "keynote", pattern: /\bkeynote\s+(?:speech|address|talk)\b/i, weight: 4 },
  { id: "transformational", pattern: /\btransformational?\s+talk\b/i, weight: 3 },
  { id: "motivation_general", pattern: /\b(?:motivational?|inspirational?)\b/i, weight: 2 },
  { id: "speech_general", pattern: /\b(?:speech|address|talk)\b/i, weight: 1 },
];

const LECTURE_SIGNALS: SignalRule[] = [
  { id: "mit_course", pattern: /\bMIT\d{2}\.\d{3}[A-Z]\d{2}\b/i, weight: 6 },
  { id: "course_number", pattern: /\b(?:CS|EE|ME|PHYS|CHEM|MATH|BIO)\s*\d{3,4}\b/i, weight: 4 },
  { id: "lecture_series", pattern: /\blecture\s+series\b/i, weight: 4 },
  { id: "lecture_number", pattern: /\blecture\s+\d+\b/i, weight: 4 },
  { id: "course_syllabus", pattern: /\bcourse\s+syllabus\b/i, weight: 5 },
  { id: "full_course", pattern: /\bfull\s+(?:academic\s+)?course\b/i, weight: 5 },
  { id: "tutorial", pattern: /\b(?:tutorial|how\s+to\s+program|programming\s+tutorial)\b/i, weight: 4 },
  { id: "classroom", pattern: /\bclassroom\s+recording\b/i, weight: 4 },
  { id: "engineering_course", pattern: /\bengineering\s+course\b/i, weight: 4 },
  { id: "crypto_course", pattern: /\bcryptocurrency\s+engineering\b/i, weight: 5 },
  { id: "academic_seminar", pattern: /\bacademic\s+seminar\b/i, weight: 3 },
  { id: "semester", pattern: /\b(?:fall|spring|summer)\s+\d{4}\s+course\b/i, weight: 3 },
  { id: "how_to_speak_course", pattern: /\bhow\s+to\s+speak\b.*\b(?:course|lecture|class)\b/i, weight: 5 },
];

const LECTURE_MOTIVATION_OVERRIDE: SignalRule[] = [
  { id: "commencement_override", pattern: /\bcommencement\s+(?:speech|address)\b/i, weight: 5 },
  { id: "keynote_override", pattern: /\bkeynote\s+(?:speech|address)\b/i, weight: 5 },
  { id: "motivational_override", pattern: /\b(?:motivational?|inspirational?)\s+(?:speech|talk|message)\b/i, weight: 4 },
  { id: "personal_development_override", pattern: /\bpersonal\s+(?:development|growth)\s+(?:talk|speech)\b/i, weight: 4 },
];

const PODCAST_SIGNALS: SignalRule[] = [
  { id: "podcast_episode", pattern: /\bpodcast\s+episode\b/i, weight: 5 },
  { id: "episode_number", pattern: /\bepisode\s+\d+\b/i, weight: 3 },
  { id: "rss_episode", pattern: /\brss\s+episode\b/i, weight: 4 },
  { id: "weekly_show", pattern: /\bweekly\s+show\b/i, weight: 3 },
  { id: "radio_talk_episode", pattern: /\bradio\s+talk\s+episode\b/i, weight: 4 },
  { id: "podcast_season", pattern: /\bpodcast\s+season\b/i, weight: 4 },
  { id: "hosted_conversation", pattern: /\bhosted\s+conversation\s+series\b/i, weight: 4 },
];

const FILM_SIGNALS: SignalRule[] = [
  { id: "feature_film", pattern: /\bfeature\s+film\b/i, weight: 5 },
  { id: "short_film", pattern: /\bshort\s+film\b/i, weight: 4 },
  { id: "documentary", pattern: /\bdocumentary\b/i, weight: 4 },
  { id: "movie", pattern: /\b(?:full\s+)?movie\b/i, weight: 3 },
  { id: "serial", pattern: /\b(?:tv\s+)?serial\b/i, weight: 3 },
];

const TV_SIGNALS: SignalRule[] = [
  { id: "television_episode", pattern: /\btelevision\s+episode\b/i, weight: 5 },
  { id: "news_program", pattern: /\bnews\s+program\b/i, weight: 4 },
  { id: "broadcast_recording", pattern: /\bbroadcast\s+recording\b/i, weight: 3 },
];

const REJECT_SIGNALS: SignalRule[] = [
  { id: "playlist", pattern: /\bplaylist\b/i, weight: 5 },
  { id: "collection", pattern: /\b(?:video\s+)?collection\b/i, weight: 4 },
  { id: "video_archive", pattern: /\bvideo\s+archive\b/i, weight: 4 },
  { id: "generic_videos", pattern: /^(?:videos?|my\s+videos?)$/i, weight: 6 },
  { id: "trailer", pattern: /\b(?:trailer|teaser)\b/i, weight: 5 },
  { id: "commercial", pattern: /\b(?:commercial|advertisement|advert|promo\s+reel)\b/i, weight: 5 },
  { id: "test_sample", pattern: /\b(?:^test$|^sample$|test\s+entry)\b/i, weight: 6 },
  { id: "unknown_title", pattern: /^(?:unknown|untitled)$/i, weight: 6 },
  { id: "raw_filename", pattern: /^(?:video[_-]?\d+|vid\d+|item\d+)$/i, weight: 6 },
];

function buildHaystack(input: MotivationClassifierInput, normalized?: MotivationNormalizedMetadata) {
  const parts = [
    normalized?.title || input.title,
    normalized?.description || input.description,
    normalized?.creator || input.creator,
    normalized?.speaker || input.speaker,
    normalized?.channel || input.channel,
    input.collection,
    input.provider,
    input.category,
    ...(input.subjects || []),
    ...(input.tags || []),
    ...(input.fileNames || []),
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function matchSignals(haystack: string, rules: SignalRule[]) {
  const matched: string[] = [];
  let score = 0;
  for (const rule of rules) {
    if (rule.pattern.test(haystack)) {
      matched.push(rule.id);
      score += rule.weight;
    }
  }
  return { matched, score };
}

export function classifyMotivationContent(
  input: MotivationClassifierInput
): MotivationContentClassification {
  const normalized = normalizeMotivationMetadata({
    title: input.title,
    description: input.description,
    creator: input.creator,
    speaker: input.speaker,
    channel: input.channel,
    tags: input.tags,
    subjects: input.subjects,
    language: input.language,
    country: null,
    fileNames: input.fileNames,
  });

  const title = normalized.title || String(input.title || "").trim();
  const haystack = buildHaystack(input, normalized);

  const positive = matchSignals(haystack, ACCEPT_SIGNALS);
  const negative = matchSignals(haystack, REJECT_SIGNALS);
  const lectures = matchSignals(haystack, LECTURE_SIGNALS);
  const lectureOverrides = matchSignals(haystack, LECTURE_MOTIVATION_OVERRIDE);
  const podcasts = matchSignals(haystack, PODCAST_SIGNALS);
  const films = matchSignals(haystack, FILM_SIGNALS);
  const tv = matchSignals(haystack, TV_SIGNALS);

  if (!title || isWeakMotivationTitle(title)) {
    return {
      decision: "reject",
      confidence: 0.95,
      reason: "Weak or machine-generated title.",
      positiveSignals: positive.matched,
      negativeSignals: [...negative.matched, "weak_title"],
      routingSignals: [],
    };
  }

  if (negative.score >= 4) {
    return {
      decision: "reject",
      confidence: Math.min(0.98, 0.6 + negative.score * 0.05),
      reason: `Blocking non-motivational catalog signal: ${negative.matched.join(", ")}.`,
      positiveSignals: positive.matched,
      negativeSignals: negative.matched,
      routingSignals: [],
    };
  }

  const lectureScore = lectures.score - lectureOverrides.score;
  const routingCandidates: Array<{ decision: MotivationContentDecision; score: number; signals: string[] }> = [
    { decision: "route_lectures", score: lectureScore, signals: lectures.matched },
    { decision: "route_podcasts", score: podcasts.score, signals: podcasts.matched },
    { decision: "route_films", score: films.score, signals: films.matched },
    { decision: "route_tv", score: tv.score, signals: tv.matched },
  ];

  routingCandidates.sort((a, b) => b.score - a.score);
  const topRoute = routingCandidates[0];

  if (topRoute && topRoute.score >= 4 && topRoute.score > positive.score) {
    return {
      decision: topRoute.decision,
      confidence: Math.min(0.95, 0.55 + topRoute.score * 0.05),
      reason: `Strong ${topRoute.decision.replace("route_", "")} routing signal.`,
      positiveSignals: positive.matched,
      negativeSignals: negative.matched,
      routingSignals: topRoute.signals,
    };
  }

  if (positive.score >= 3 && negative.score === 0) {
    return {
      decision: "accept",
      confidence: Math.min(0.95, 0.5 + positive.score * 0.05),
      reason: "Strong motivational content signals with no blocking negatives.",
      positiveSignals: positive.matched,
      negativeSignals: negative.matched,
      routingSignals: [],
    };
  }

  if (positive.score >= 2 && lectureScore <= 1 && negative.score <= 1) {
    return {
      decision: "accept",
      confidence: Math.min(0.85, 0.45 + positive.score * 0.05),
      reason: "Motivational signals present with acceptable metadata.",
      positiveSignals: positive.matched,
      negativeSignals: negative.matched,
      routingSignals: topRoute?.signals || [],
    };
  }

  if (lectureScore >= 2 && lectureOverrides.score >= 2) {
    return {
      decision: "hold",
      confidence: 0.6,
      reason: "Mixed university and motivational signals; manual review recommended.",
      positiveSignals: positive.matched,
      negativeSignals: negative.matched,
      routingSignals: [...lectures.matched, ...lectureOverrides.matched],
    };
  }

  if (positive.score > 0 && (lectures.score > 0 || podcasts.score > 0 || films.score > 0)) {
    return {
      decision: "hold",
      confidence: 0.55,
      reason: "Mixed motivational and section-routing signals.",
      positiveSignals: positive.matched,
      negativeSignals: negative.matched,
      routingSignals: [
        ...lectures.matched,
        ...podcasts.matched,
        ...films.matched,
        ...tv.matched,
      ],
    };
  }

  if (positive.score === 0 && haystack.length < 24) {
    return {
      decision: "reject",
      confidence: 0.7,
      reason: "Insufficient metadata to confirm motivational intent.",
      positiveSignals: [],
      negativeSignals: negative.matched,
      routingSignals: [],
    };
  }

  if (positive.score === 0) {
    return {
      decision: "hold",
      confidence: 0.5,
      reason: "Weak metadata with no reliable motivational intent.",
      positiveSignals: positive.matched,
      negativeSignals: negative.matched,
      routingSignals: topRoute?.signals || [],
    };
  }

  return {
    decision: "hold",
    confidence: 0.45,
    reason: "Mixed or weak classification signals.",
    positiveSignals: positive.matched,
    negativeSignals: negative.matched,
    routingSignals: topRoute?.signals || [],
  };
}

export function contentClassificationAllowsPublic(decision: MotivationContentDecision) {
  return decision === "accept";
}

export function contentClassificationBlocksImport(decision: MotivationContentDecision) {
  return (
    decision === "reject" ||
    decision === "route_lectures" ||
    decision === "route_podcasts" ||
    decision === "route_audiobooks" ||
    decision === "route_films" ||
    decision === "route_tv"
  );
}

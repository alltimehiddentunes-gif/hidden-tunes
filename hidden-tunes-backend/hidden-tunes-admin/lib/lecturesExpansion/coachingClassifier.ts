export type CoachingClassification = {
  isCoaching: boolean;
  coachingSpecialty: string | null;
  coachingSubcategory: string | null;
  primaryCategory: string;
  rejected: boolean;
  rejectionReason: string | null;
  hasInstructionalValue: boolean;
  isPromotional: boolean;
  informationalOnly: boolean;
};

const PROMOTIONAL_PATTERNS = [
  /\bbuy now\b/i,
  /\blimited offer\b/i,
  /\bsign up today\b/i,
  /\bbook a call\b/i,
  /\bfree consultation\b/i,
  /\btestimonial only\b/i,
  /\baffiliate link\b/i,
  /\bclick the link\b/i,
  /\bmy coaching package\b/i,
  /\bwork with me\b/i,
];

const REJECT_PATTERNS = [
  /\btrailer\b/i,
  /\bteaser\b/i,
  /\bpromo only\b/i,
  /\badvertisement\b/i,
  /\bguaranteed income\b/i,
  /\bget rich quick\b/i,
  /\bcrypto scam\b/i,
];

const INSTRUCTIONAL_PATTERNS = [
  /\blesson\b/i,
  /\bframework\b/i,
  /\bexercise\b/i,
  /\bworkshop\b/i,
  /\bmethod\b/i,
  /\bstep by step\b/i,
  /\bhow to\b/i,
  /\bpractice session\b/i,
  /\bcoaching session\b/i,
  /\bskill development\b/i,
  /\blearning outcome\b/i,
  /\bguided\b/i,
];

const COACHING_PATTERNS = [
  /\bcoach(ing|es|ed)?\b/i,
  /\bmasterclass\b/i,
  /\bmentor(ing|ship)?\b/i,
  /\btraining program\b/i,
  /\bcoaching program\b/i,
];

const MOTIVATIONAL_ONLY = [
  /\bmotivational speech\b/i,
  /\binspirational talk only\b/i,
  /\bpep talk\b/i,
];

export function classifyCoachingContent(input: {
  title: string;
  description?: string | null;
  queryFamily?: string | null;
}): CoachingClassification {
  const haystack = `${input.title} ${input.description || ""} ${input.queryFamily || ""}`;

  if (REJECT_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return {
      isCoaching: false,
      coachingSpecialty: null,
      coachingSubcategory: null,
      primaryCategory: "academic-lectures",
      rejected: true,
      rejectionReason: "promotional_or_low_value",
      hasInstructionalValue: false,
      isPromotional: true,
      informationalOnly: false,
    };
  }

  const isCoachingQuery = /\bcoach/i.test(input.queryFamily || "");
  const looksLikeCoaching = COACHING_PATTERNS.some((pattern) => pattern.test(haystack)) || isCoachingQuery;
  const isPromotional = PROMOTIONAL_PATTERNS.some((pattern) => pattern.test(haystack));
  const hasInstructionalValue = INSTRUCTIONAL_PATTERNS.some((pattern) => pattern.test(haystack));
  const motivationalOnly =
    MOTIVATIONAL_ONLY.some((pattern) => pattern.test(haystack)) && !hasInstructionalValue;

  if (motivationalOnly) {
    return {
      isCoaching: false,
      coachingSpecialty: null,
      coachingSubcategory: null,
      primaryCategory: "personal-development",
      rejected: true,
      rejectionReason: "motivational_not_coaching",
      hasInstructionalValue: false,
      isPromotional: false,
      informationalOnly: false,
    };
  }

  if (looksLikeCoaching && isPromotional && !hasInstructionalValue) {
    return {
      isCoaching: true,
      coachingSpecialty: null,
      coachingSubcategory: null,
      primaryCategory: "coaching",
      rejected: true,
      rejectionReason: "promotional_coaching",
      hasInstructionalValue: false,
      isPromotional: true,
      informationalOnly: false,
    };
  }

  if (looksLikeCoaching && !hasInstructionalValue && !isCoachingQuery) {
    return {
      isCoaching: true,
      coachingSpecialty: null,
      coachingSubcategory: null,
      primaryCategory: "coaching",
      rejected: true,
      rejectionReason: "no_instructional_substance",
      hasInstructionalValue: false,
      isPromotional: false,
      informationalOnly: false,
    };
  }

  if (!looksLikeCoaching) {
    return {
      isCoaching: false,
      coachingSpecialty: null,
      coachingSubcategory: null,
      primaryCategory: "academic-lectures",
      rejected: false,
      rejectionReason: null,
      hasInstructionalValue: hasInstructionalValue || true,
      isPromotional: false,
      informationalOnly: false,
    };
  }

  const specialty = inferCoachingSpecialty(haystack);
  return {
    isCoaching: true,
    coachingSpecialty: specialty,
    coachingSubcategory: specialty,
    primaryCategory: "coaching",
    rejected: false,
    rejectionReason: null,
    hasInstructionalValue: true,
    isPromotional: false,
    informationalOnly: /informational only|not medical advice|not financial advice|not legal advice/i.test(haystack),
  };
}

function inferCoachingSpecialty(haystack: string) {
  const pairs: Array<[string, RegExp]> = [
    ["career-coaching", /\bcareer\b/i],
    ["leadership-coaching", /\bleadership\b/i],
    ["business-coaching", /\bbusiness\b/i],
    ["fitness-coaching", /\bfitness\b/i],
    ["parenting-coaching", /\bparenting\b/i],
    ["financial-coaching", /\bfinancial\b|\bmoney\b/i],
    ["study-coaching", /\bstudy\b|\bacademic\b|\bstudent\b/i],
    ["communication-coaching", /\bcommunication\b|\bpublic speaking\b/i],
    ["wellness-coaching", /\bwellness\b|\bhealth\b/i],
    ["productivity-coaching", /\bproductivity\b|\btime management\b/i],
    ["relationship-coaching", /\brelationship\b|\bdating\b|\bmarriage\b/i],
    ["sports-coaching", /\bsports\b|\bathletic\b/i],
    ["coach-training", /\bcoach training\b|\bcertification\b/i],
  ];
  for (const [slug, pattern] of pairs) {
    if (pattern.test(haystack)) return slug;
  }
  return "life-coaching";
}

export function buildCoachingMetadata(classification: CoachingClassification, coachName: string | null) {
  return {
    coaching_specialty: classification.coachingSpecialty,
    coaching_subcategory: classification.coachingSubcategory,
    coach_name: coachName,
    program_format: classification.isCoaching ? "coaching_program" : null,
    session_type: classification.isCoaching ? "coaching_session" : null,
    informational_only: classification.informationalOnly,
    coaching_rejected: classification.rejected,
    coaching_rejection_reason: classification.rejectionReason,
  };
}

export const MUSIC_TAXONOMY_TYPES = [
  "GENRE_FAMILY",
  "GENRE",
  "SUBGENRE",
  "REGIONAL_STYLE",
  "CULTURAL_STYLE",
  "MOOD",
  "ACTIVITY",
  "THEME",
  "LANGUAGE",
  "VOCAL_STYLE",
  "INSTRUMENT",
  "ERA",
  "TEMPO_CLASS",
] as const;

export type MusicTaxonomyType = (typeof MUSIC_TAXONOMY_TYPES)[number];

export const MUSIC_RELATIONSHIP_TYPES = [
  "PRIMARY_GENRE",
  "SECONDARY_GENRE",
  "PRIMARY_SUBGENRE",
  "SUBGENRE",
  "REGIONAL_STYLE",
  "CULTURAL_STYLE",
  "MOOD",
  "ACTIVITY",
  "THEME",
  "LANGUAGE",
  "VOCAL_STYLE",
  "INSTRUMENT",
  "ERA",
  "TEMPO_CLASS",
] as const;

export type MusicRelationshipType = (typeof MUSIC_RELATIONSHIP_TYPES)[number];

export const MUSIC_SOURCE_KEYS = ["mureka", "djcity"] as const;
export type MusicSourceKey = (typeof MUSIC_SOURCE_KEYS)[number];

export const DEFAULT_MUSIC_SOURCE: MusicSourceKey = "mureka";
export const MAX_TAXONOMY_TERM_PAGE_SIZE = 1000;
export const MAX_TAXONOMY_PUBLIC_TERMS = 1000;
export const MAX_TAXONOMY_ASSIGNMENTS = 100;
export const MAX_TAXONOMY_FILTER_VALUES = 8;

export type MusicTaxonomyTerm = {
  id: string;
  slug: string;
  name: string;
  taxonomy_type: MusicTaxonomyType;
  parent_id: string | null;
  description: string | null;
  region: string | null;
  status: "ACTIVE" | "HIDDEN" | "DEPRECATED" | "MERGED";
  merged_into_term_id: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  assignment_count?: number;
};

export type MusicTaxonomyDraft = {
  primaryGenreId: string;
  secondaryGenreIds: string[];
  primarySubgenreId: string;
  subgenreIds: string[];
  regionalStyleIds: string[];
  culturalStyleIds: string[];
  moodIds: string[];
  activityIds: string[];
  themeIds: string[];
  languageIds: string[];
  vocalStyleIds: string[];
  instrumentIds: string[];
  eraId: string;
  tempoClassId: string;
};

export type MusicTaxonomyAssignment = {
  term_id: string;
  relationship_type: MusicRelationshipType;
  assignment_state: "ACCEPTED";
  confidence: number;
  source: "OWNER" | "IMPORT" | "AUTO" | "SYSTEM";
};

export type MusicAudioFeatures = {
  bpm?: number | null;
  musicalKey?: string | null;
  mode?: string | null;
  timeSignature?: string | null;
  energy?: number | null;
  danceability?: number | null;
  valence?: number | null;
  acousticness?: number | null;
  instrumentalness?: number | null;
  speechiness?: number | null;
  liveFeel?: boolean | null;
  analysisStatus?: string | null;
  analysisSource?: string | null;
  confidence?: number | null;
};

export type MusicTrackSource = {
  track_id: string;
  source_key: MusicSourceKey;
  source_label: string;
  is_explicit: boolean;
  created_at?: string;
  updated_at?: string;
};

export type MusicTaxonomyInput = {
  primaryGenreId?: unknown;
  secondaryGenreIds?: unknown;
  primarySubgenreId?: unknown;
  subgenreIds?: unknown;
  regionalStyleIds?: unknown;
  culturalStyleIds?: unknown;
  moodIds?: unknown;
  activityIds?: unknown;
  themeIds?: unknown;
  languageIds?: unknown;
  vocalStyleIds?: unknown;
  instrumentIds?: unknown;
  eraId?: unknown;
  tempoClassId?: unknown;
};

export class MusicTaxonomyValidationError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = "MusicTaxonomyValidationError";
  }
}

export function isMusicTaxonomyType(value: unknown): value is MusicTaxonomyType {
  return MUSIC_TAXONOMY_TYPES.includes(value as MusicTaxonomyType);
}

export function isMusicRelationshipType(
  value: unknown
): value is MusicRelationshipType {
  return MUSIC_RELATIONSHIP_TYPES.includes(value as MusicRelationshipType);
}

export function normalizeTaxonomyLabel(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifyTaxonomy(value: unknown) {
  return normalizeTaxonomyLabel(value).replace(/\s+/g, "-");
}

function text(value: unknown, maxLength = 120) {
  const result = String(value ?? "").trim();
  return result.slice(0, maxLength);
}

function singleId(value: unknown) {
  const result = text(value, 100);
  return result;
}

function idList(value: unknown, fieldName: string) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : value == null
        ? []
        : [value];

  if (raw.length > MAX_TAXONOMY_ASSIGNMENTS) {
    throw new MusicTaxonomyValidationError(
      `${fieldName} has too many values. The maximum is ${MAX_TAXONOMY_ASSIGNMENTS}.`
    );
  }

  return Array.from(
    new Set(raw.map((item) => singleId(item)).filter(Boolean))
  );
}

export function normalizeMusicTaxonomyDraft(
  input: unknown,
  options: { requirePrimaryGenre?: boolean } = {}
): MusicTaxonomyDraft {
  const body = input && typeof input === "object" ? (input as MusicTaxonomyInput) : {};
  const draft: MusicTaxonomyDraft = {
    primaryGenreId: singleId(body.primaryGenreId),
    secondaryGenreIds: idList(body.secondaryGenreIds, "secondaryGenreIds"),
    primarySubgenreId: singleId(body.primarySubgenreId),
    subgenreIds: idList(body.subgenreIds, "subgenreIds"),
    regionalStyleIds: idList(body.regionalStyleIds, "regionalStyleIds"),
    culturalStyleIds: idList(body.culturalStyleIds, "culturalStyleIds"),
    moodIds: idList(body.moodIds, "moodIds"),
    activityIds: idList(body.activityIds, "activityIds"),
    themeIds: idList(body.themeIds, "themeIds"),
    languageIds: idList(body.languageIds, "languageIds"),
    vocalStyleIds: idList(body.vocalStyleIds, "vocalStyleIds"),
    instrumentIds: idList(body.instrumentIds, "instrumentIds"),
    eraId: singleId(body.eraId),
    tempoClassId: singleId(body.tempoClassId),
  };

  if (draft.primarySubgenreId) {
    draft.subgenreIds = draft.subgenreIds.filter(
      (termId) => termId !== draft.primarySubgenreId
    );
  }

  if (options.requirePrimaryGenre && !draft.primaryGenreId) {
    throw new MusicTaxonomyValidationError(
      "A primary genre is required before saving music classification."
    );
  }

  return draft;
}

function addAssignments(
  assignments: MusicTaxonomyAssignment[],
  ids: string[],
  relationshipType: MusicRelationshipType,
  source: MusicTaxonomyAssignment["source"]
) {
  ids.forEach((termId) => {
    assignments.push({
      term_id: termId,
      relationship_type: relationshipType,
      assignment_state: "ACCEPTED",
      confidence: 1,
      source,
    });
  });
}

export function musicTaxonomyDraftToAssignments(
  draft: MusicTaxonomyDraft,
  options: {
    source?: MusicTaxonomyAssignment["source"];
    requirePrimaryGenre?: boolean;
  } = {}
) {
  const source = options.source || "OWNER";
  if (options.requirePrimaryGenre !== false && !draft.primaryGenreId) {
    throw new MusicTaxonomyValidationError(
      "A primary genre is required before saving music classification."
    );
  }

  const assignments: MusicTaxonomyAssignment[] = [];
  addAssignments(assignments, draft.primaryGenreId ? [draft.primaryGenreId] : [], "PRIMARY_GENRE", source);
  addAssignments(assignments, draft.secondaryGenreIds, "SECONDARY_GENRE", source);
  addAssignments(
    assignments,
    draft.primarySubgenreId ? [draft.primarySubgenreId] : [],
    "PRIMARY_SUBGENRE",
    source
  );
  addAssignments(assignments, draft.subgenreIds, "SUBGENRE", source);
  addAssignments(assignments, draft.regionalStyleIds, "REGIONAL_STYLE", source);
  addAssignments(assignments, draft.culturalStyleIds, "CULTURAL_STYLE", source);
  addAssignments(assignments, draft.moodIds, "MOOD", source);
  addAssignments(assignments, draft.activityIds, "ACTIVITY", source);
  addAssignments(assignments, draft.themeIds, "THEME", source);
  addAssignments(assignments, draft.languageIds, "LANGUAGE", source);
  addAssignments(assignments, draft.vocalStyleIds, "VOCAL_STYLE", source);
  addAssignments(assignments, draft.instrumentIds, "INSTRUMENT", source);
  addAssignments(assignments, draft.eraId ? [draft.eraId] : [], "ERA", source);
  addAssignments(
    assignments,
    draft.tempoClassId ? [draft.tempoClassId] : [],
    "TEMPO_CLASS",
    source
  );

  return assignments;
}

export function musicTaxonomyAssignmentsToDraft(
  assignments: Array<Partial<MusicTaxonomyAssignment> & { term_id?: unknown }>
): MusicTaxonomyDraft {
  const draft = normalizeMusicTaxonomyDraft({});

  assignments.forEach((assignment) => {
    if (assignment.assignment_state && assignment.assignment_state !== "ACCEPTED") return;
    const termId = singleId(assignment.term_id);
    if (!termId) return;

    switch (assignment.relationship_type) {
      case "PRIMARY_GENRE":
        draft.primaryGenreId = termId;
        break;
      case "SECONDARY_GENRE":
        draft.secondaryGenreIds.push(termId);
        break;
      case "PRIMARY_SUBGENRE":
        draft.primarySubgenreId = termId;
        break;
      case "SUBGENRE":
        draft.subgenreIds.push(termId);
        break;
      case "REGIONAL_STYLE":
        draft.regionalStyleIds.push(termId);
        break;
      case "CULTURAL_STYLE":
        draft.culturalStyleIds.push(termId);
        break;
      case "MOOD":
        draft.moodIds.push(termId);
        break;
      case "ACTIVITY":
        draft.activityIds.push(termId);
        break;
      case "THEME":
        draft.themeIds.push(termId);
        break;
      case "LANGUAGE":
        draft.languageIds.push(termId);
        break;
      case "VOCAL_STYLE":
        draft.vocalStyleIds.push(termId);
        break;
      case "INSTRUMENT":
        draft.instrumentIds.push(termId);
        break;
      case "ERA":
        draft.eraId = termId;
        break;
      case "TEMPO_CLASS":
        draft.tempoClassId = termId;
        break;
      default:
        break;
    }
  });

  draft.secondaryGenreIds = Array.from(new Set(draft.secondaryGenreIds));
  draft.subgenreIds = Array.from(new Set(draft.subgenreIds));
  draft.regionalStyleIds = Array.from(new Set(draft.regionalStyleIds));
  draft.culturalStyleIds = Array.from(new Set(draft.culturalStyleIds));
  draft.moodIds = Array.from(new Set(draft.moodIds));
  draft.activityIds = Array.from(new Set(draft.activityIds));
  draft.themeIds = Array.from(new Set(draft.themeIds));
  draft.languageIds = Array.from(new Set(draft.languageIds));
  draft.vocalStyleIds = Array.from(new Set(draft.vocalStyleIds));
  draft.instrumentIds = Array.from(new Set(draft.instrumentIds));

  return draft;
}

export function normalizeAudioFeatures(input: unknown): MusicAudioFeatures {
  if (!input || typeof input !== "object") return {};
  const body = input as Record<string, unknown>;
  const result: MusicAudioFeatures = {};

  const boundedNumber = (key: keyof MusicAudioFeatures, min: number, max: number) => {
    if (body[key] === undefined || body[key] === null || body[key] === "") return;
    const value = Number(body[key]);
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new MusicTaxonomyValidationError(`${String(key)} must be between ${min} and ${max}.`);
    }
    result[key] = value as never;
  };

  boundedNumber("bpm", 0, 400);
  boundedNumber("energy", 0, 1);
  boundedNumber("danceability", 0, 1);
  boundedNumber("valence", 0, 1);
  boundedNumber("acousticness", 0, 1);
  boundedNumber("instrumentalness", 0, 1);
  boundedNumber("speechiness", 0, 1);
  boundedNumber("confidence", 0, 1);

  ["musicalKey", "mode", "timeSignature", "analysisStatus", "analysisSource"].forEach(
    (key) => {
      if (body[key] !== undefined && body[key] !== null) {
        result[key as keyof MusicAudioFeatures] = text(body[key], 80) as never;
      }
    }
  );

  if (body.liveFeel !== undefined && body.liveFeel !== null) {
    if (typeof body.liveFeel !== "boolean") {
      throw new MusicTaxonomyValidationError("liveFeel must be a boolean.");
    }
    result.liveFeel = body.liveFeel;
  }

  return result;
}

export function normalizeMusicSource(input: unknown): {
  sourceKey: MusicSourceKey;
  sourceLabel: string;
  isExplicit: boolean;
} {
  const body =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : { sourceKey: input };
  const sourceKey = text(body.sourceKey ?? body.source ?? body.source_name, 40).toLowerCase() || DEFAULT_MUSIC_SOURCE;
  const isExplicit = body.isExplicit === true || body.explicit === true;

  if (!MUSIC_SOURCE_KEYS.includes(sourceKey as MusicSourceKey)) {
    throw new MusicTaxonomyValidationError("Unsupported music source.");
  }

  if (sourceKey === "djcity" && !isExplicit) {
    throw new MusicTaxonomyValidationError(
      "DJcity is a legacy source and must be explicitly selected."
    );
  }

  return {
    sourceKey: sourceKey as MusicSourceKey,
    sourceLabel: sourceKey === "djcity" ? "DJcity" : "Mureka",
    isExplicit,
  };
}

export function taxonomyTypeForRelationship(
  relationshipType: MusicRelationshipType
): MusicTaxonomyType {
  switch (relationshipType) {
    case "PRIMARY_GENRE":
    case "SECONDARY_GENRE":
      return "GENRE";
    case "PRIMARY_SUBGENRE":
    case "SUBGENRE":
      return "SUBGENRE";
    case "REGIONAL_STYLE":
      return "REGIONAL_STYLE";
    case "CULTURAL_STYLE":
      return "CULTURAL_STYLE";
    case "MOOD":
      return "MOOD";
    case "ACTIVITY":
      return "ACTIVITY";
    case "THEME":
      return "THEME";
    case "LANGUAGE":
      return "LANGUAGE";
    case "VOCAL_STYLE":
      return "VOCAL_STYLE";
    case "INSTRUMENT":
      return "INSTRUMENT";
    case "ERA":
      return "ERA";
    case "TEMPO_CLASS":
      return "TEMPO_CLASS";
  }
}

export function emptyMusicTaxonomyDraft(): MusicTaxonomyDraft {
  return normalizeMusicTaxonomyDraft({});
}

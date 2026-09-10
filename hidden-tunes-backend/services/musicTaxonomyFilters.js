import { isUuid } from "./apiDiagnostics.js";
import { supabase } from "./supabase.js";
import { normalizeMusicTaxonomyFilters } from "./musicTaxonomyFilterUtils.js";

const MAX_VALUES_PER_FILTER = 8;
const MAX_TERM_ROWS = 500;
const MAX_ASSIGNMENT_ROWS = 10_000;
const MAX_TRACK_IDS = 5_000;

const FILTER_DEFINITIONS = {
  genre: { taxonomyType: "GENRE", relationshipTypes: ["PRIMARY_GENRE", "SECONDARY_GENRE"] },
  subgenre: { taxonomyType: "SUBGENRE", relationshipTypes: ["PRIMARY_SUBGENRE", "SUBGENRE"] },
  mood: { taxonomyType: "MOOD", relationshipTypes: ["MOOD"] },
  region: { taxonomyType: "REGIONAL_STYLE", relationshipTypes: ["REGIONAL_STYLE"] },
  language: { taxonomyType: "LANGUAGE", relationshipTypes: ["LANGUAGE"] },
  activity: { taxonomyType: "ACTIVITY", relationshipTypes: ["ACTIVITY"] },
  era: { taxonomyType: "ERA", relationshipTypes: ["ERA"] },
  tempo: { taxonomyType: "TEMPO_CLASS", relationshipTypes: ["TEMPO_CLASS"] },
};

export class MusicTaxonomyFilterError extends Error {
  status = 503;

  constructor(message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "MusicTaxonomyFilterError";
  }
}

function hasTaxonomyFilters(filters) {
  return Object.values(filters || {}).some((values) => Array.isArray(values) && values.length > 0);
}

async function loadTermIds(values, definition) {
  const uuidValues = values.filter(isUuid);
  const slugValues = values.filter((value) => !isUuid(value));
  const requests = [];

  if (slugValues.length) {
    requests.push(
      supabase
        .from("music_taxonomy_terms")
        .select("id,slug,taxonomy_type")
        .eq("taxonomy_type", definition.taxonomyType)
        .eq("status", "ACTIVE")
        .in("slug", slugValues)
        .limit(MAX_TERM_ROWS)
    );
  }
  if (uuidValues.length) {
    requests.push(
      supabase
        .from("music_taxonomy_terms")
        .select("id,slug,taxonomy_type")
        .eq("taxonomy_type", definition.taxonomyType)
        .eq("status", "ACTIVE")
        .in("id", uuidValues)
        .limit(MAX_TERM_ROWS)
    );
  }

  const results = await Promise.all(requests);
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;

  return Array.from(
    new Set(
      results.flatMap((result) => (result.data || []).map((term) => String(term.id || "")).filter(Boolean))
    )
  );
}

/**
 * Resolves canonical taxonomy filters to a bounded set of public song IDs.
 * Values inside one dimension are OR; dimensions are AND. No call is made
 * when the caller did not request a taxonomy filter.
 */
export async function resolveMusicTaxonomyTrackIds(filters, options = {}) {
  if (!hasTaxonomyFilters(filters)) {
    return { trackIds: null, resolvedKeys: new Set(), requestedKeys: new Set() };
  }

  const requestedKeys = new Set(Object.keys(filters));
  const resolvedKeys = new Set();
  const termIdsByKey = new Map();

  try {
    await Promise.all(
      Object.entries(filters).map(async ([key, values]) => {
        const definition = FILTER_DEFINITIONS[key];
        if (!definition) return;
        const termIds = await loadTermIds(values, definition);
        termIdsByKey.set(key, { termIds, definition });
        if (termIds.length) resolvedKeys.add(key);
      })
    );
  } catch (error) {
    if (
      options.allowLegacyFallback &&
      Object.keys(filters || {}).every((key) => key === "genre" || key === "mood")
    ) {
      return { trackIds: null, resolvedKeys: new Set(), requestedKeys };
    }
    throw new MusicTaxonomyFilterError(
      "Canonical music taxonomy filters are unavailable. Apply the taxonomy migration before using these filters.",
      error
    );
  }

  const hardNoMatch = Array.from(termIdsByKey.entries()).some(
    ([key, value]) => value.termIds.length === 0 && key !== "genre" && key !== "mood"
  );
  if (hardNoMatch) {
    return { trackIds: [], resolvedKeys, requestedKeys };
  }

  const activeDimensions = Array.from(termIdsByKey.entries()).filter(([, value]) => value.termIds.length > 0);
  if (!activeDimensions.length) {
    return { trackIds: null, resolvedKeys, requestedKeys };
  }

  const allTermIds = Array.from(new Set(activeDimensions.flatMap(([, value]) => value.termIds)));
  let assignmentResult;
  try {
    assignmentResult = await supabase
      .from("music_track_taxonomy")
      .select("track_id,term_id,relationship_type")
      .eq("assignment_state", "ACCEPTED")
      .in("term_id", allTermIds)
      .limit(MAX_ASSIGNMENT_ROWS);
  } catch (error) {
    throw new MusicTaxonomyFilterError("Canonical music taxonomy assignments are unavailable.", error);
  }
  if (assignmentResult.error) {
    throw new MusicTaxonomyFilterError("Canonical music taxonomy assignments are unavailable.", assignmentResult.error);
  }

  const trackMatches = new Map();
  (assignmentResult.data || []).forEach((row) => {
    const trackId = String(row.track_id || "");
    if (!trackId) return;
    const entry = trackMatches.get(trackId) || new Map();
    entry.set(`${String(row.term_id)}:${String(row.relationship_type)}`, true);
    trackMatches.set(trackId, entry);
  });

  const matchingTrackIds = [];
  for (const [trackId, assignments] of trackMatches.entries()) {
    const matchesEveryDimension = activeDimensions.every(([, value]) =>
      value.termIds.some((termId) =>
        value.definition.relationshipTypes.some((relationshipType) =>
          assignments.has(`${termId}:${relationshipType}`)
        )
      )
    );
    if (matchesEveryDimension) matchingTrackIds.push(trackId);
    if (matchingTrackIds.length >= MAX_TRACK_IDS) break;
  }

  return { trackIds: matchingTrackIds, resolvedKeys, requestedKeys };
}

export const MUSIC_TAXONOMY_FILTER_LIMITS = {
  maxValuesPerFilter: MAX_VALUES_PER_FILTER,
  maxTermRows: MAX_TERM_ROWS,
  maxAssignmentRows: MAX_ASSIGNMENT_ROWS,
  maxTrackIds: MAX_TRACK_IDS,
};

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  MAX_TAXONOMY_PUBLIC_TERMS,
  MAX_TAXONOMY_TERM_PAGE_SIZE,
  MusicTaxonomyAssignment,
  MusicTaxonomyTerm,
  MusicTaxonomyType,
  MusicTaxonomyValidationError,
  isMusicTaxonomyType,
  musicTaxonomyAssignmentsToDraft,
  musicTaxonomyDraftToAssignments,
  normalizeAudioFeatures,
  normalizeMusicSource,
  normalizeMusicTaxonomyDraft,
  normalizeTaxonomyLabel,
  slugifyTaxonomy,
  taxonomyTypeForRelationship,
} from "@/lib/musicTaxonomy";

type TaxonomyStatus = MusicTaxonomyTerm["status"];

type ListTaxonomyOptions = {
  query?: string;
  taxonomyType?: MusicTaxonomyType;
  parentId?: string | null;
  statuses?: TaxonomyStatus[];
  page?: number;
  pageSize?: number;
  includeUsage?: boolean;
};

export function isMissingMusicTaxonomySchemaError(error: unknown) {
  const value = error as { code?: unknown; message?: unknown } | null;
  const code = String(value?.code || "");
  const message = String(value?.message || error || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("music_taxonomy") ||
    message.includes("music_track_taxonomy")
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asTerm(value: unknown): MusicTaxonomyTerm {
  const row = asRecord(value);
  if (!isMusicTaxonomyType(row.taxonomy_type)) {
    throw new Error("Taxonomy term returned an unsupported taxonomy type.");
  }

  return {
    id: String(row.id || ""),
    slug: String(row.slug || ""),
    name: String(row.name || ""),
    taxonomy_type: row.taxonomy_type,
    parent_id: row.parent_id ? String(row.parent_id) : null,
    description: row.description == null ? null : String(row.description),
    region: row.region == null ? null : String(row.region),
    status: (String(row.status || "ACTIVE") as TaxonomyStatus),
    merged_into_term_id: row.merged_into_term_id
      ? String(row.merged_into_term_id)
      : null,
    sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function assignmentCounts(termIds: string[]) {
  const counts = new Map<string, number>();
  if (termIds.length === 0) return counts;

  const { data, error } = await supabaseAdmin
    .from("music_track_taxonomy")
    .select("term_id")
    .in("term_id", termIds)
    .eq("assignment_state", "ACCEPTED")
    .limit(10000);

  if (error) throw error;

  (data || []).forEach((row: Record<string, unknown>) => {
    const termId = String(row.term_id || "");
    if (termId) counts.set(termId, (counts.get(termId) || 0) + 1);
  });

  return counts;
}

export async function listMusicTaxonomyTerms(options: ListTaxonomyOptions = {}) {
  const page = Math.max(1, Math.floor(options.page || 1));
  const pageSize = Math.min(
    MAX_TAXONOMY_TERM_PAGE_SIZE,
    Math.max(1, Math.floor(options.pageSize || 50))
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin
    .from("music_taxonomy_terms")
    .select("*", { count: "exact" })
    .order("taxonomy_type", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .range(from, to);

  if (options.query) {
    query = query.ilike("name", `%${escapeLike(options.query.slice(0, 80))}%`);
  }
  if (options.taxonomyType) query = query.eq("taxonomy_type", options.taxonomyType);
  if (options.parentId === null) query = query.is("parent_id", null);
  if (options.parentId) query = query.eq("parent_id", options.parentId);
  if (options.statuses?.length) query = query.in("status", options.statuses);

  const { data, error, count } = await query;
  if (error) throw error;

  const terms = ((data || []) as unknown[]).map(asTerm);
  const counts = options.includeUsage
    ? await assignmentCounts(terms.map((term) => term.id))
    : new Map<string, number>();

  return {
    terms: terms.map((term) => ({
      ...term,
      ...(options.includeUsage ? { assignment_count: counts.get(term.id) || 0 } : {}),
    })),
    pagination: {
      page,
      pageSize,
      returned: terms.length,
      total: count || 0,
      totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
    },
  };
}

export async function listPublicMusicTaxonomyTerms(options: {
  query?: string;
  taxonomyType?: MusicTaxonomyType;
  parentId?: string | null;
} = {}) {
  const result = await listMusicTaxonomyTerms({
    ...options,
    statuses: ["ACTIVE"],
    page: 1,
    pageSize: MAX_TAXONOMY_PUBLIC_TERMS,
    includeUsage: false,
  });

  return result.terms;
}

async function loadTerm(id: string) {
  const { data, error } = await supabaseAdmin
    .from("music_taxonomy_terms")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? asTerm(data) : null;
}

export async function getMusicTaxonomyTerm(id: string) {
  return loadTerm(id);
}

async function assertParentIsValid(
  taxonomyType: MusicTaxonomyType,
  parentId: string | null | undefined,
  currentId?: string
) {
  if (parentId === undefined || parentId === null || parentId === "") return;
  if (parentId === currentId) {
    throw new MusicTaxonomyValidationError("A taxonomy term cannot parent itself.");
  }

  const parent = await loadTerm(parentId);
  if (!parent) throw new MusicTaxonomyValidationError("Parent taxonomy term not found.");

  const allowedParentTypes: Partial<Record<MusicTaxonomyType, MusicTaxonomyType[]>> = {
    GENRE: ["GENRE_FAMILY"],
    SUBGENRE: ["GENRE"],
    REGIONAL_STYLE: ["REGIONAL_STYLE"],
  };
  const allowed = allowedParentTypes[taxonomyType];
  if (allowed && !allowed.includes(parent.taxonomy_type)) {
    throw new MusicTaxonomyValidationError(
      `${taxonomyType} terms may only be nested under ${allowed.join(" or ")}.`
    );
  }
  if (parent.status === "MERGED" || parent.status === "DEPRECATED") {
    throw new MusicTaxonomyValidationError("A disabled or merged term cannot be a parent.");
  }

  if (!currentId) return;
  let cursor: string | null = parent.id;
  for (let index = 0; index < 20 && cursor; index += 1) {
    if (cursor === currentId) {
      throw new MusicTaxonomyValidationError("That parent would create a taxonomy cycle.");
    }
    const ancestor = await loadTerm(cursor);
    cursor = ancestor?.parent_id || null;
  }
}

function normalizeTermStatus(value: unknown, fallback: TaxonomyStatus = "ACTIVE") {
  const status = String(value ?? fallback).trim().toUpperCase();
  if (!(["ACTIVE", "HIDDEN", "DEPRECATED"] as string[]).includes(status)) {
    throw new MusicTaxonomyValidationError("Invalid taxonomy term status.");
  }
  return status as Exclude<TaxonomyStatus, "MERGED">;
}

export async function createMusicTaxonomyTerm(input: Record<string, unknown>) {
  const taxonomyType = String(input.taxonomyType || input.taxonomy_type || "").trim();
  if (!isMusicTaxonomyType(taxonomyType)) {
    throw new MusicTaxonomyValidationError("Invalid taxonomy_type.");
  }

  const name = String(input.name || "").trim().slice(0, 120);
  if (!name) throw new MusicTaxonomyValidationError("A taxonomy term name is required.");
  const slug = slugifyTaxonomy(input.slug || name).slice(0, 120);
  if (!slug) throw new MusicTaxonomyValidationError("A taxonomy term slug is required.");
  const parentId = input.parentId === null ? null : String(input.parentId || "").trim() || null;
  await assertParentIsValid(taxonomyType, parentId);

  const { data, error } = await supabaseAdmin
    .from("music_taxonomy_terms")
    .insert({
      taxonomy_type: taxonomyType,
      slug,
      name,
      parent_id: parentId,
      description: String(input.description || "").trim().slice(0, 1000) || null,
      region: String(input.region || "").trim().slice(0, 120) || null,
      status: normalizeTermStatus(input.status),
      sort_order: Math.max(-100000, Math.min(100000, Math.trunc(Number(input.sortOrder) || 0))),
    })
    .select("*")
    .single();
  if (error) throw error;
  return asTerm(data);
}

export async function updateMusicTaxonomyTerm(
  id: string,
  input: Record<string, unknown>
) {
  const existing = await loadTerm(id);
  if (!existing) return null;
  if (existing.status === "MERGED") {
    throw new MusicTaxonomyValidationError(
      "Merged taxonomy terms are immutable history records. Edit the active target term instead."
    );
  }
  if (input.status !== undefined && String(input.status).toUpperCase() === "MERGED") {
    throw new MusicTaxonomyValidationError("Use the merge action to merge taxonomy terms.");
  }

  const parentId = input.parentId === null
    ? null
    : input.parentId === undefined
      ? undefined
      : String(input.parentId || "").trim() || null;
  await assertParentIsValid(existing.taxonomy_type, parentId, id);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = String(input.name || "").trim().slice(0, 120);
    if (!name) throw new MusicTaxonomyValidationError("A taxonomy term name is required.");
    patch.name = name;
  }
  if (input.slug !== undefined) {
    const slug = slugifyTaxonomy(input.slug).slice(0, 120);
    if (!slug) throw new MusicTaxonomyValidationError("A taxonomy term slug is required.");
    patch.slug = slug;
  }
  if (input.description !== undefined) patch.description = String(input.description || "").trim().slice(0, 1000) || null;
  if (input.region !== undefined) patch.region = String(input.region || "").trim().slice(0, 120) || null;
  if (input.status !== undefined) patch.status = normalizeTermStatus(input.status, existing.status);
  if (input.sortOrder !== undefined) patch.sort_order = Math.max(-100000, Math.min(100000, Math.trunc(Number(input.sortOrder) || 0)));
  if (parentId !== undefined) patch.parent_id = parentId;
  if (Object.keys(patch).length === 0) return existing;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("music_taxonomy_terms")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return asTerm(data);
}

export async function createMusicTaxonomyAlias(
  termId: string,
  aliasValue: unknown,
  actorId?: string
) {
  const term = await loadTerm(termId);
  if (!term) return null;
  const alias = String(aliasValue || "").trim().slice(0, 120);
  const normalizedAlias = normalizeTaxonomyLabel(alias);
  if (!alias || !normalizedAlias) {
    throw new MusicTaxonomyValidationError("A non-empty alias is required.");
  }

  const { data, error } = await supabaseAdmin
    .from("music_taxonomy_aliases")
    .insert({
      term_id: term.id,
      taxonomy_type: term.taxonomy_type,
      alias,
      normalized_alias: normalizedAlias,
      created_by: actorId || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMusicTaxonomyAlias(termId: string, aliasId: string) {
  const { error } = await supabaseAdmin
    .from("music_taxonomy_aliases")
    .delete()
    .eq("id", aliasId)
    .eq("term_id", termId);
  if (error) throw error;
}

export async function listMusicTaxonomyAliases(termId: string) {
  const { data, error } = await supabaseAdmin
    .from("music_taxonomy_aliases")
    .select("*")
    .eq("term_id", termId)
    .order("alias", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function mergeMusicTaxonomyTerm(
  sourceTermId: string,
  targetTermId: string,
  actorId?: string
) {
  if (!sourceTermId || !targetTermId || sourceTermId === targetTermId) {
    throw new MusicTaxonomyValidationError("A source and a different target term are required.");
  }

  const { error } = await supabaseAdmin.rpc("merge_music_taxonomy_term", {
    p_source_term_id: sourceTermId,
    p_target_term_id: targetTermId,
    p_actor_id: actorId || null,
  });
  if (error) throw error;

  return loadTerm(sourceTermId);
}

async function validateAssignments(assignments: MusicTaxonomyAssignment[]) {
  const termIds = Array.from(new Set(assignments.map((assignment) => assignment.term_id)));
  if (termIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("music_taxonomy_terms")
      .select("id,taxonomy_type,status")
      .in("id", termIds);
    if (error) throw error;

    const rows = new Map(
      ((data || []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row])
    );
    if (rows.size !== termIds.length) {
      throw new MusicTaxonomyValidationError("One or more taxonomy terms no longer exist.");
    }
    assignments.forEach((assignment) => {
      const row = rows.get(assignment.term_id);
      if (!row || row.status !== "ACTIVE") {
        throw new MusicTaxonomyValidationError("Only active taxonomy terms can be assigned.");
      }
      const expectedType = taxonomyTypeForRelationship(assignment.relationship_type);
      if (row.taxonomy_type !== expectedType) {
        throw new MusicTaxonomyValidationError(
          `Term ${assignment.term_id} is not valid for ${assignment.relationship_type}.`
        );
      }
    });
  }
}

export async function upsertMusicTrackSource(
  trackId: string,
  sourceInput: unknown,
  actorId?: string
) {
  const source = normalizeMusicSource(sourceInput);
  const { data, error } = await supabaseAdmin
    .from("music_track_sources")
    .upsert(
      {
        track_id: trackId,
        source_key: source.sourceKey,
        source_label: source.sourceLabel,
        is_explicit: source.isExplicit,
        actor_id: actorId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "track_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function captureMusicTrackLegacyMetadata(
  trackId: string,
  fields: { genre?: unknown; mood?: unknown }
) {
  const rows = Object.entries(fields)
    .map(([fieldName, value]) => ({
      track_id: trackId,
      field_name: fieldName,
      raw_value: String(value ?? "").trim().slice(0, 500),
    }))
    .filter((row) => row.raw_value.length > 0);

  if (!rows.length) return [];

  const { data, error } = await supabaseAdmin
    .from("music_track_legacy_metadata")
    .upsert(rows, { onConflict: "track_id,field_name,raw_value" })
    .select("id,track_id,field_name,raw_value,captured_at");
  if (error) throw error;
  return data || [];
}

export async function persistMusicTrackClassification(options: {
  trackId: string;
  taxonomyInput: unknown;
  sourceInput?: unknown;
  featuresInput?: unknown;
  actorId?: string;
}) {
  const draft = normalizeMusicTaxonomyDraft(options.taxonomyInput, {
    requirePrimaryGenre: true,
  });
  const assignments = musicTaxonomyDraftToAssignments(draft, {
    source: "OWNER",
    requirePrimaryGenre: true,
  });
  await validateAssignments(assignments);
  const features = normalizeAudioFeatures(options.featuresInput);

  const { error } = await supabaseAdmin.rpc("replace_music_track_classification", {
    p_track_id: options.trackId,
    p_assignments: assignments,
    p_features: features,
    p_actor_id: options.actorId || null,
  });
  if (error) throw error;

  let source = null;
  if (options.sourceInput !== undefined) {
    source = await upsertMusicTrackSource(
      options.trackId,
      options.sourceInput,
      options.actorId
    );
  }

  return { draft, assignments, features, source };
}

export async function loadMusicTrackClassification(trackId: string) {
  const { data: track, error: trackError } = await supabaseAdmin
    .from("songs")
    .select(
      "id,title,artist,artist_name,album,album_title,artwork_url,cover_url,genre,mood,source_name,source_type,uploaded_by_user_id"
    )
    .eq("id", trackId)
    .maybeSingle();
  if (trackError) throw trackError;
  if (!track) return null;

  const [sourceResult, assignmentsResult, legacyResult, featuresResult] = await Promise.all([
    supabaseAdmin.from("music_track_sources").select("*").eq("track_id", trackId).maybeSingle(),
    supabaseAdmin
      .from("music_track_taxonomy")
      .select("id,term_id,relationship_type,assignment_state,confidence,source,created_at,updated_at")
      .eq("track_id", trackId)
      .order("relationship_type", { ascending: true }),
    supabaseAdmin
      .from("music_track_legacy_metadata")
      .select("id,field_name,raw_value,captured_at")
      .eq("track_id", trackId)
      .order("field_name", { ascending: true }),
    supabaseAdmin.from("music_track_audio_features").select("*").eq("track_id", trackId).maybeSingle(),
  ]);

  if (sourceResult.error) throw sourceResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;
  if (legacyResult.error) throw legacyResult.error;
  if (featuresResult.error) throw featuresResult.error;

  const rawAssignments = (assignmentsResult.data || []) as Array<Record<string, unknown>>;
  const termIds = Array.from(new Set(rawAssignments.map((row) => String(row.term_id || "")).filter(Boolean)));
  const termsResult = termIds.length
    ? await supabaseAdmin.from("music_taxonomy_terms").select("*").in("id", termIds)
    : { data: [], error: null };
  if (termsResult.error) throw termsResult.error;
  const termMap = new Map(
    ((termsResult.data || []) as unknown[]).map((term) => {
      const normalized = asTerm(term);
      return [normalized.id, normalized];
    })
  );

  const assignments = rawAssignments.map((row) => ({
    id: String(row.id || ""),
    term_id: String(row.term_id || ""),
    relationship_type: String(row.relationship_type || ""),
    assignment_state: String(row.assignment_state || ""),
    confidence: row.confidence == null ? null : Number(row.confidence),
    source: String(row.source || ""),
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    term: termMap.get(String(row.term_id || "")) || null,
  }));
  const draft = musicTaxonomyAssignmentsToDraft(
    rawAssignments as Array<Partial<MusicTaxonomyAssignment> & { term_id?: unknown }>
  );
  const legacy = (legacyResult.data || []) as Array<Record<string, unknown>>;
  const hasPrimaryGenre = assignments.some(
    (assignment) => assignment.relationship_type === "PRIMARY_GENRE" && assignment.assignment_state === "ACCEPTED"
  );
  const hasPrimaryMood = assignments.some(
    (assignment) => assignment.relationship_type === "MOOD" && assignment.assignment_state === "ACCEPTED"
  );
  const legacyGenre = legacy.find((row) => row.field_name === "genre")?.raw_value || null;
  const legacyMood = legacy.find((row) => row.field_name === "mood")?.raw_value || null;

  return {
    track: track as Record<string, unknown>,
    source: (sourceResult.data || null) as Record<string, unknown> | null,
    assignments,
    draft,
    features: (featuresResult.data || null) as Record<string, unknown> | null,
    legacy,
    health: {
      hasPrimaryGenre,
      hasPrimaryMood,
      hasAcceptedTaxonomy: assignments.some((assignment) => assignment.assignment_state === "ACCEPTED"),
      legacyGenre,
      legacyMood,
      legacyGenreMapped: hasPrimaryGenre && assignments.some(
        (assignment) => assignment.relationship_type === "PRIMARY_GENRE" && assignment.source === "LEGACY"
      ),
      legacyMoodMapped: hasPrimaryMood && assignments.some(
        (assignment) => assignment.relationship_type === "MOOD" && assignment.source === "LEGACY"
      ),
      unknownLegacyLabels: [
        !hasPrimaryGenre && legacyGenre ? `genre:${legacyGenre}` : null,
        !hasPrimaryMood && legacyMood ? `mood:${legacyMood}` : null,
      ].filter(Boolean),
    },
  };
}

export async function getMusicTaxonomyHealth() {
  const [termsResult, assignmentsResult, songsResult, sourcesResult] = await Promise.all([
    supabaseAdmin.from("music_taxonomy_terms").select("id,status,taxonomy_type").limit(5000),
    supabaseAdmin.from("music_track_taxonomy").select("track_id,assignment_state,relationship_type").limit(10000),
    supabaseAdmin.from("songs").select("id,genre,mood").limit(10000),
    supabaseAdmin.from("music_track_sources").select("track_id,source_key").limit(10000),
  ]);
  if (termsResult.error) throw termsResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;
  if (songsResult.error) throw songsResult.error;
  if (sourcesResult.error) throw sourcesResult.error;

  const terms = (termsResult.data || []) as Array<Record<string, unknown>>;
  const assignments = (assignmentsResult.data || []) as Array<Record<string, unknown>>;
  const songs = (songsResult.data || []) as Array<Record<string, unknown>>;
  const assignmentTrackIds = new Set(
    assignments
      .filter((row) => row.assignment_state === "ACCEPTED")
      .map((row) => String(row.track_id || ""))
      .filter(Boolean)
  );
  const taxonomyTrackIds = new Set(
    songs
      .map((song) => String(song.id || ""))
      .filter((id) => assignmentTrackIds.has(id))
  );
  const legacySongs = songs.filter(
    (song) => String(song.genre || "").trim() || String(song.mood || "").trim()
  );

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  terms.forEach((term) => {
    const type = String(term.taxonomy_type || "unknown");
    const status = String(term.status || "unknown");
    byType[type] = (byType[type] || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
  });

  return {
    schemaReady: true,
    termCount: terms.length,
    assignmentCount: assignments.filter((row) => row.assignment_state === "ACCEPTED").length,
    classifiedTrackCount: taxonomyTrackIds.size,
    legacyLabelTrackCount: legacySongs.length,
    unmappedLegacyTrackCount: Math.max(0, legacySongs.length - taxonomyTrackIds.size),
    sourceCount: (sourcesResult.data || []).length,
    termsByType: byType,
    termsByStatus: byStatus,
    bounded: {
      maxTermsRead: 5000,
      maxAssignmentsRead: 10000,
      maxSongsRead: 10000,
    },
  };
}

export function musicTaxonomyErrorResponseMessage(error: unknown) {
  return errorMessage(error, "Music taxonomy operation failed.");
}

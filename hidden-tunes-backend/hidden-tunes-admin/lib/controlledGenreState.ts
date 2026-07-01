import {
  buildNormalizedGenrePayload,
  getDefaultMainGenreId,
  getDefaultSubgenreId,
  inferGenreSelectionFromLabel,
  type NormalizedGenrePayload,
} from "@/lib/uploadGenreTaxonomy";

export type ControlledGenreDraft = {
  mainGenreId: string;
  subgenreId: string;
  genre: string;
  legacyGenre: string | null;
};

export function resolveGenreFields(mainGenreId: string, subgenreId: string) {
  const payload = buildNormalizedGenrePayload({ mainGenreId, subgenreId });

  return {
    mainGenreId,
    subgenreId,
    genre: payload?.genre || "",
  };
}

export function getGenreSelectionFromLegacyLabel(label: unknown): ControlledGenreDraft {
  const legacyGenre = String(label || "").trim() || null;
  const inferred = inferGenreSelectionFromLabel(label);

  if (inferred) {
    const payload = buildNormalizedGenrePayload(inferred);

    if (payload) {
      return {
        mainGenreId: payload.mainGenreId,
        subgenreId: payload.subgenreId,
        genre: payload.genre,
        legacyGenre,
      };
    }
  }

  const mainGenreId = getDefaultMainGenreId();
  const subgenreId = getDefaultSubgenreId(mainGenreId);
  const fallback = buildNormalizedGenrePayload({ mainGenreId, subgenreId });

  return {
    mainGenreId,
    subgenreId,
    genre: fallback?.genre || legacyGenre || "Uncategorized",
    legacyGenre,
  };
}

export function buildGenreSavePayload(draft: ControlledGenreDraft) {
  const structured = buildNormalizedGenrePayload({
    mainGenreId: draft.mainGenreId,
    subgenreId: draft.subgenreId,
  });

  const payload: NormalizedGenrePayload = structured || {
    genre: draft.genre,
    displayLabel: draft.genre,
    mainGenre: "Uncategorized",
    subGenre: draft.genre,
    genreSlug: "uncategorized",
    mainGenreId: draft.mainGenreId,
    subgenreId: draft.subgenreId,
  };

  return {
    mainGenreId: payload.mainGenreId,
    subgenreId: payload.subgenreId,
    genre: payload.genre,
    mainGenre: payload.mainGenre,
    subGenre: payload.subGenre,
    genreSlug: payload.genreSlug,
  };
}

export function hasStructuredGenrePayload(body: Record<string, unknown>) {
  return Boolean(
    body.mainGenreId ||
      body.subgenreId ||
      body.genre ||
      body.mainGenre ||
      body.subGenre ||
      body.genreSlug ||
      body.legacyGenreOverride
  );
}

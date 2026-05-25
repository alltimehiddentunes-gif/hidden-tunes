export type EmotionalMetadataDraft = {
  energy: string;
  tempoBpm: string;
  atmosphere: string;
  emotion: string;
  texture: string;
  timeOfDay: string;
  vocalFeel: string;
  instrumentation: string;
  analysisStatus: string;
  analysisSource: string;
};

export const EMOTIONAL_FIELD_ALIASES = {
  energy: ["energy"],
  tempo_bpm: ["tempoBpm", "tempo_bpm"],
  atmosphere: ["atmosphere"],
  emotion: ["emotion"],
  texture: ["texture"],
  time_of_day: ["timeOfDay", "time_of_day"],
  vocal_feel: ["vocalFeel", "vocal_feel"],
  instrumentation: ["instrumentation"],
  analysis_status: ["analysisStatus", "analysis_status"],
  analysis_source: ["analysisSource", "analysis_source"],
} as const;

export function emptyEmotionalDraft(): EmotionalMetadataDraft {
  return {
    energy: "",
    tempoBpm: "",
    atmosphere: "",
    emotion: "",
    texture: "",
    timeOfDay: "",
    vocalFeel: "",
    instrumentation: "",
    analysisStatus: "",
    analysisSource: "",
  };
}

export function hasEmotionalDraftValues(draft: EmotionalMetadataDraft) {
  return Object.values(draft).some((value) => String(value || "").trim() !== "");
}

function stringOrNull(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildEmotionalMetadata(track: Record<string, unknown>) {
  return {
    energy: numberOrNull(track.energy),
    tempoBpm: numberOrNull(track.tempo_bpm),
    atmosphere: stringOrNull(track.atmosphere),
    emotion: stringOrNull(track.emotion),
    texture: stringOrNull(track.texture),
    timeOfDay: stringOrNull(track.time_of_day),
    vocalFeel: stringOrNull(track.vocal_feel),
    instrumentation: stringOrNull(track.instrumentation),
    analysisStatus: stringOrNull(track.analysis_status),
    analysisSource: stringOrNull(track.analysis_source),
  };
}

function hasBodyField(body: Record<string, unknown>, keys: readonly string[]) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function pickBodyField(body: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return body[key];
    }
  }

  return undefined;
}

function parseOptionalEnergy(
  value: unknown
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: false, error: "Missing energy value." };
  }

  if (value === null || value === "") {
    return { ok: true, value: null };
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    return {
      ok: false,
      error: "Energy must be a whole number between 0 and 100.",
    };
  }

  return { ok: true, value: parsed };
}

function parseOptionalTempoBpm(
  value: unknown
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: false, error: "Missing tempo value." };
  }

  if (value === null || value === "") {
    return { ok: true, value: null };
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return {
      ok: false,
      error: "Tempo must be a positive whole number (BPM).",
    };
  }

  return { ok: true, value: parsed };
}

function parseOptionalText(
  value: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: false, error: "Missing text value." };
  }

  if (value === null) {
    return { ok: true, value: null };
  }

  const text = String(value).trim();
  return { ok: true, value: text || null };
}

export function validateEmotionalDraft(
  draft: EmotionalMetadataDraft
): { ok: true } | { ok: false; error: string } {
  const energyText = draft.energy.trim();
  if (energyText !== "") {
    const parsed = parseOptionalEnergy(energyText === "" ? null : Number(energyText));
    if (!parsed.ok) return parsed;
  }

  const tempoText = draft.tempoBpm.trim();
  if (tempoText !== "") {
    const parsed = parseOptionalTempoBpm(tempoText === "" ? null : Number(tempoText));
    if (!parsed.ok) return parsed;
  }

  return { ok: true };
}

export function buildEmotionalRequestBody(
  draft: EmotionalMetadataDraft
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const energyText = draft.energy.trim();
  const tempoText = draft.tempoBpm.trim();

  if (energyText !== "") {
    body.energy = Number(energyText);
  }

  if (tempoText !== "") {
    body.tempoBpm = Number(tempoText);
  }

  const textFieldMap: Array<[keyof EmotionalMetadataDraft, string]> = [
    ["atmosphere", "atmosphere"],
    ["emotion", "emotion"],
    ["texture", "texture"],
    ["timeOfDay", "timeOfDay"],
    ["vocalFeel", "vocalFeel"],
    ["instrumentation", "instrumentation"],
    ["analysisStatus", "analysisStatus"],
    ["analysisSource", "analysisSource"],
  ];

  for (const [draftKey, bodyKey] of textFieldMap) {
    const text = draft[draftKey].trim();
    if (text) {
      body[bodyKey] = text;
    }
  }

  return body;
}

export function buildEmotionalMetadataPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};

  if (hasBodyField(body, EMOTIONAL_FIELD_ALIASES.energy)) {
    const parsed = parseOptionalEnergy(
      pickBodyField(body, EMOTIONAL_FIELD_ALIASES.energy)
    );
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    patch.energy = parsed.value;
  }

  if (hasBodyField(body, EMOTIONAL_FIELD_ALIASES.tempo_bpm)) {
    const parsed = parseOptionalTempoBpm(
      pickBodyField(body, EMOTIONAL_FIELD_ALIASES.tempo_bpm)
    );
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    patch.tempo_bpm = parsed.value;
  }

  const textFields = [
    "atmosphere",
    "emotion",
    "texture",
    "time_of_day",
    "vocal_feel",
    "instrumentation",
    "analysis_status",
    "analysis_source",
  ] as const;

  for (const field of textFields) {
    if (!hasBodyField(body, EMOTIONAL_FIELD_ALIASES[field])) continue;

    const parsed = parseOptionalText(pickBodyField(body, EMOTIONAL_FIELD_ALIASES[field]));
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    patch[field] = parsed.value;
  }

  return { ok: true as const, patch };
}

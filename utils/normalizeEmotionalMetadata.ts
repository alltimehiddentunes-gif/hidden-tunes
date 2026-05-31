import type {
  EmotionalMetadataRaw,
  EmotionalVector,
} from "../types/music";
import {
  EMOTIONAL_VECTOR_DIMENSIONS,
  TAG_VECTOR_MAPS,
  type EmotionalVectorWeights,
} from "./emotionalMapping";

export type NormalizedEmotionalMetadata = {
  emotionalMetadataRaw: EmotionalMetadataRaw | null;
  emotionalVector: EmotionalVector | null;
  emotionalTags: string[];
};

const TAG_FIELD_KEYS = [
  "atmosphere",
  "emotion",
  "texture",
  "timeOfDay",
  "vocalFeel",
  "instrumentation",
] as const;

type TagFieldKey = (typeof TAG_FIELD_KEYS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function readInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  return Math.round(parsed);
}

function normalizeTaxonomyTag(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;

  return text
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function pickRawValue(
  source: Record<string, unknown>,
  camelKey: string,
  snakeKey: string
): unknown {
  if (Object.prototype.hasOwnProperty.call(source, camelKey)) {
    return source[camelKey];
  }

  if (Object.prototype.hasOwnProperty.call(source, snakeKey)) {
    return source[snakeKey];
  }

  return undefined;
}

function extractEmotionalMetadataRaw(source: unknown): EmotionalMetadataRaw | null {
  if (!isRecord(source)) return null;

  const nested = isRecord(source.emotionalMetadata)
    ? source.emotionalMetadata
    : isRecord(source.emotional_metadata)
      ? source.emotional_metadata
      : null;

  const rawContainer = isRecord(source.raw) ? source.raw : null;
  const candidates = [nested, rawContainer, source].filter(Boolean) as Record<
    string,
    unknown
  >[];

  let energy: number | null = null;
  let tempoBpm: number | null = null;
  let atmosphere: string | null = null;
  let emotion: string | null = null;
  let texture: string | null = null;
  let timeOfDay: string | null = null;
  let vocalFeel: string | null = null;
  let instrumentation: string | null = null;
  let analysisStatus: string | null = null;
  let analysisSource: string | null = null;

  for (const candidate of candidates) {
    if (energy === null) {
      energy = readInteger(pickRawValue(candidate, "energy", "energy"));
    }
    if (tempoBpm === null) {
      tempoBpm = readInteger(
        pickRawValue(candidate, "tempoBpm", "tempo_bpm")
      );
    }
    if (!atmosphere) {
      atmosphere = readString(
        pickRawValue(candidate, "atmosphere", "atmosphere")
      );
    }
    if (!emotion) {
      emotion = readString(pickRawValue(candidate, "emotion", "emotion"));
    }
    if (!texture) {
      texture = readString(pickRawValue(candidate, "texture", "texture"));
    }
    if (!timeOfDay) {
      timeOfDay = readString(
        pickRawValue(candidate, "timeOfDay", "time_of_day")
      );
    }
    if (!vocalFeel) {
      vocalFeel = readString(
        pickRawValue(candidate, "vocalFeel", "vocal_feel")
      );
    }
    if (!instrumentation) {
      instrumentation = readString(
        pickRawValue(candidate, "instrumentation", "instrumentation")
      );
    }
    if (!analysisStatus) {
      analysisStatus = readString(
        pickRawValue(candidate, "analysisStatus", "analysis_status")
      );
    }
    if (!analysisSource) {
      analysisSource = readString(
        pickRawValue(candidate, "analysisSource", "analysis_source")
      );
    }
  }

  const hasValues =
    energy !== null ||
    tempoBpm !== null ||
    Boolean(atmosphere) ||
    Boolean(emotion) ||
    Boolean(texture) ||
    Boolean(timeOfDay) ||
    Boolean(vocalFeel) ||
    Boolean(instrumentation) ||
    Boolean(analysisStatus) ||
    Boolean(analysisSource);

  if (!hasValues) return null;

  return {
    energy,
    tempoBpm,
    atmosphere,
    emotion,
    texture,
    timeOfDay,
    vocalFeel,
    instrumentation,
    analysisStatus,
    analysisSource,
  };
}

function buildEmotionalTags(raw: EmotionalMetadataRaw | null): string[] {
  if (!raw) return [];

  const tags = new Set<string>();

  for (const field of TAG_FIELD_KEYS) {
    const value = raw[field as TagFieldKey];
    const normalized = normalizeTaxonomyTag(value);
    if (normalized) {
      tags.add(normalized);
    }
  }

  return Array.from(tags);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function createNeutralVector(): EmotionalVector {
  return {
    energy: 0.5,
    warmth: 0.5,
    darkness: 0.5,
    intimacy: 0.5,
    nostalgia: 0.5,
    aggression: 0.5,
  };
}

function applyWeights(
  vector: EmotionalVector,
  weights: EmotionalVectorWeights,
  scale = 1
) {
  for (const dimension of EMOTIONAL_VECTOR_DIMENSIONS) {
    const delta = weights[dimension];
    if (typeof delta !== "number" || !Number.isFinite(delta)) continue;
    vector[dimension] += delta * scale;
  }
}

function lookupTagWeights(
  field: TagFieldKey,
  tag: string
): EmotionalVectorWeights | null {
  const map = TAG_VECTOR_MAPS[field];
  return map[tag] || null;
}

function buildEmotionalVector(
  raw: EmotionalMetadataRaw | null
): EmotionalVector | null {
  if (!raw) return null;

  const vector = createNeutralVector();
  let contributions = 0;

  if (raw.energy !== null && raw.energy !== undefined) {
    vector.energy = clamp01(raw.energy / 100);
    contributions += 1;
  }

  if (raw.tempoBpm !== null && raw.tempoBpm !== undefined) {
    if (raw.tempoBpm >= 128) {
      applyWeights(vector, { energy: 0.15, aggression: 0.1 });
    } else if (raw.tempoBpm <= 78) {
      applyWeights(vector, { energy: -0.12, intimacy: 0.08, warmth: 0.05 });
    }
    contributions += 1;
  }

  for (const field of TAG_FIELD_KEYS) {
    const normalized = normalizeTaxonomyTag(raw[field as TagFieldKey]);
    if (!normalized) continue;

    const weights = lookupTagWeights(field, normalized);
    if (weights) {
      applyWeights(vector, weights, 0.85);
      contributions += 1;
    }
  }

  if (contributions === 0) return null;

  for (const dimension of EMOTIONAL_VECTOR_DIMENSIONS) {
    vector[dimension] = clamp01(vector[dimension]);
  }

  return vector;
}

export function normalizeEmotionalMetadata(
  source: unknown
): NormalizedEmotionalMetadata {
  const emotionalMetadataRaw = extractEmotionalMetadataRaw(source);
  const emotionalTags = buildEmotionalTags(emotionalMetadataRaw);
  const emotionalVector = buildEmotionalVector(emotionalMetadataRaw);

  return {
    emotionalMetadataRaw,
    emotionalVector,
    emotionalTags,
  };
}

export function hasEmotionalMetadata(
  metadata: NormalizedEmotionalMetadata
): boolean {
  return (
    metadata.emotionalMetadataRaw !== null ||
    metadata.emotionalTags.length > 0 ||
    metadata.emotionalVector !== null
  );
}

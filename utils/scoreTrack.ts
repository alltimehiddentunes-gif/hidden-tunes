import type { EmotionalVector, QueryContext, Track } from "../types/music";
import { getWorldPreset } from "./emotionalWorlds";
import {
  EMOTIONAL_VECTOR_DIMENSIONS,
  TAG_VECTOR_MAPS,
  type EmotionalVectorWeights,
} from "./emotionalMapping";

const SCORE_WEIGHTS = {
  text: 0.35,
  tag: 0.3,
  vector: 0.25,
  world: 0.1,
} as const;

type WorldProfile = {
  tags: string[];
  vector?: EmotionalVectorWeights;
};

const WORLD_PROFILES: Record<string, WorldProfile> = {
  "late-night": {
    tags: ["late-night", "midnight", "intimate", "calm", "reflective", "melancholy"],
    vector: { darkness: 0.35, intimacy: 0.25, energy: -0.15 },
  },
  healing: {
    tags: ["healing", "comfort", "peace", "warm", "soft", "acceptance"],
    vector: { warmth: 0.35, intimacy: 0.2, aggression: -0.25 },
  },
  "party-energy": {
    tags: ["urban", "electronic", "desire", "hope", "live-drums", "energy"],
    vector: { energy: 0.35, aggression: 0.15, warmth: 0.05 },
  },
  romantic: {
    tags: ["romantic", "intimate", "desire", "warm", "soft", "soulful"],
    vector: { intimacy: 0.35, warmth: 0.25, nostalgia: 0.1 },
  },
  nostalgic: {
    tags: ["nostalgia", "reflective", "melancholy", "warm", "acoustic"],
    vector: { nostalgia: 0.4, warmth: 0.15, intimacy: 0.1 },
  },
  calm: {
    tags: ["calm", "peace", "ambient", "soft", "minimal", "comfort"],
    vector: { warmth: 0.25, aggression: -0.3, energy: -0.2 },
  },
  focus: {
    tags: ["minimal", "ambient", "instrumental", "soft", "reflective"],
    vector: { energy: -0.1, aggression: -0.2, intimacy: 0.05 },
  },
  heartbreak: {
    tags: ["heartbreak", "longing", "melancholy", "loneliness", "vulnerability"],
    vector: { darkness: 0.25, nostalgia: 0.25, intimacy: 0.2 },
  },
  cinematic: {
    tags: ["cinematic", "ethereal", "reflective", "strings", "reverb-heavy"],
    vector: { nostalgia: 0.25, darkness: 0.15, intimacy: 0.1 },
  },
  "deep-feelings": {
    tags: ["vulnerability", "reflection", "emotional", "intimate", "melancholy"],
    vector: { intimacy: 0.3, nostalgia: 0.2, warmth: 0.1 },
  },
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeTag(value: unknown): string | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;

  return text
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeTagList(values: string[] | undefined): string[] {
  if (!values?.length) return [];

  const tags = new Set<string>();
  for (const value of values) {
    const normalized = normalizeTag(value);
    if (normalized) tags.add(normalized);
  }

  return Array.from(tags);
}

function tokenizeText(value: string | undefined): string[] {
  const text = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .trim();

  if (!text) return [];

  return text.split(/\s+/).filter(Boolean);
}

function trackSearchHaystack(track: Track): string {
  const parts = [
    track.title,
    track.artist,
    track.album,
    (track as { genre?: string }).genre,
    (track as { mood?: string }).mood,
  ];

  return parts
    .map((part) => String(part ?? "").toLowerCase())
    .filter(Boolean)
    .join(" ");
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
    vector[dimension] = clamp01(vector[dimension] + delta * scale);
  }
}

function buildVectorFromTags(tags: string[]): EmotionalVector | null {
  const normalizedTags = normalizeTagList(tags);
  if (!normalizedTags.length) return null;

  const vector = createNeutralVector();
  let contributions = 0;

  for (const tag of normalizedTags) {
    for (const map of Object.values(TAG_VECTOR_MAPS)) {
      const weights = map[tag];
      if (weights) {
        applyWeights(vector, weights, 0.75);
        contributions += 1;
      }
    }
  }

  return contributions > 0 ? vector : null;
}

function buildVectorFromWorld(world: string | undefined): EmotionalVector | null {
  const worldId = normalizeTag(world);
  if (!worldId) return null;

  const profile = WORLD_PROFILES[worldId];
  if (!profile) return null;

  const vector = createNeutralVector();
  if (profile.vector) {
    applyWeights(vector, profile.vector, 1);
  }

  const tagVector = buildVectorFromTags(profile.tags);
  if (!tagVector) return vector;

  for (const dimension of EMOTIONAL_VECTOR_DIMENSIONS) {
    vector[dimension] = clamp01((vector[dimension] + tagVector[dimension]) / 2);
  }

  return vector;
}

function cosineSimilarity(
  left: EmotionalVector | null | undefined,
  right: EmotionalVector | null | undefined
): number {
  if (!left || !right) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (const dimension of EMOTIONAL_VECTOR_DIMENSIONS) {
    const a = left[dimension];
    const b = right[dimension];
    dot += a * b;
    leftMagnitude += a * a;
    rightMagnitude += b * b;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;

  const cosine = dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
  return clamp01((cosine + 1) / 2);
}

function overlapRatio(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;

  const rightSet = new Set(right);
  let matches = 0;

  for (const tag of left) {
    if (rightSet.has(tag)) matches += 1;
  }

  return matches / Math.max(left.length, right.length);
}

export function textScore(track: Track, ctx: QueryContext): number {
  const query = String(ctx.text ?? "").trim().toLowerCase();
  if (!query) return 0;

  const haystack = trackSearchHaystack(track);
  if (!haystack) return 0;

  if (haystack.includes(query)) {
    return 1;
  }

  const tokens = tokenizeText(query);
  if (!tokens.length) return 0;

  let matched = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) matched += 1;
  }

  return clamp01(matched / tokens.length);
}

export function tagScore(track: Track, ctx: QueryContext): number {
  const trackTags = normalizeTagList(track.emotionalTags);
  const moodTags = normalizeTagList(ctx.moodTags);

  if (!trackTags.length || !moodTags.length) return 0;

  return clamp01(overlapRatio(trackTags, moodTags));
}

export function vectorSimilarityScore(track: Track, ctx: QueryContext): number {
  const trackVector = track.emotionalVector;
  if (!trackVector) return 0;

  const referenceVector =
    ctx.currentTrack?.emotionalVector ||
    buildVectorFromTags(normalizeTagList(ctx.moodTags)) ||
    buildVectorFromWorld(ctx.world);

  if (!referenceVector) return 0;

  return cosineSimilarity(trackVector, referenceVector);
}

export function worldAffinityScore(track: Track, ctx: QueryContext): number {
  const worldId = normalizeTag(ctx.world);
  if (!worldId) return 0;

  const preset = getWorldPreset(worldId);
  if (preset) {
    const trackTags = normalizeTagList(track.emotionalTags);
    const presetTags = normalizeTagList(preset.moodTags);
    const contextTags = normalizeTagList(ctx.moodTags);
    const presetOverlap = overlapRatio(trackTags, presetTags);
    const contextOverlap = overlapRatio(trackTags, contextTags);
    const presetBoost = clamp01(
      Math.max(presetOverlap, contextOverlap * 0.9)
    );

    const presetVector = buildVectorFromTags(presetTags);
    const vectorMatch = cosineSimilarity(track.emotionalVector, presetVector);

    return clamp01(presetBoost * 0.65 + vectorMatch * 0.35);
  }

  const profile = WORLD_PROFILES[worldId];
  if (!profile) return 0;

  const trackTags = normalizeTagList(track.emotionalTags);
  const tagOverlap = overlapRatio(trackTags, normalizeTagList(profile.tags));

  const worldVector = buildVectorFromWorld(worldId);
  const vectorMatch = cosineSimilarity(track.emotionalVector, worldVector);

  return clamp01(tagOverlap * 0.6 + vectorMatch * 0.4);
}

export function scoreTrack(track: Track, ctx: QueryContext): number {
  const components = {
    text: textScore(track, ctx),
    tag: tagScore(track, ctx),
    vector: vectorSimilarityScore(track, ctx),
    world: worldAffinityScore(track, ctx),
  };

  const weighted =
    components.text * SCORE_WEIGHTS.text +
    components.tag * SCORE_WEIGHTS.tag +
    components.vector * SCORE_WEIGHTS.vector +
    components.world * SCORE_WEIGHTS.world;

  return Math.round(clamp01(weighted) * 1000) / 10;
}

export type EmotionalVectorDimension =
  | "energy"
  | "warmth"
  | "darkness"
  | "intimacy"
  | "nostalgia"
  | "aggression";

export type EmotionalVectorWeights = Partial<
  Record<EmotionalVectorDimension, number>
>;

export const EMOTIONAL_VECTOR_DIMENSIONS: EmotionalVectorDimension[] = [
  "energy",
  "warmth",
  "darkness",
  "intimacy",
  "nostalgia",
  "aggression",
];

export const ATMOSPHERE_VECTOR_MAP: Record<string, EmotionalVectorWeights> = {
  "late-night": { darkness: 0.35, intimacy: 0.2, energy: -0.15 },
  healing: { warmth: 0.35, intimacy: 0.25, aggression: -0.2 },
  cinematic: { darkness: 0.2, nostalgia: 0.25, energy: 0.05 },
  dreamy: { intimacy: 0.2, warmth: 0.15, energy: -0.1 },
  intimate: { intimacy: 0.4, warmth: 0.2, energy: -0.1 },
  rainy: { darkness: 0.2, nostalgia: 0.15, warmth: 0.1 },
  calm: { warmth: 0.25, aggression: -0.25, energy: -0.2 },
  ambient: { intimacy: 0.15, energy: -0.15, darkness: 0.1 },
  urban: { energy: 0.2, darkness: 0.15, aggression: 0.1 },
  ethereal: { intimacy: 0.2, nostalgia: 0.15, energy: -0.05 },
  warm: { warmth: 0.35, intimacy: 0.15 },
  minimal: { energy: -0.1, aggression: -0.15, intimacy: 0.1 },
  "night-drive": { darkness: 0.25, nostalgia: 0.2, energy: 0.1 },
  reflective: { nostalgia: 0.3, intimacy: 0.15, energy: -0.1 },
};

export const EMOTION_VECTOR_MAP: Record<string, EmotionalVectorWeights> = {
  heartbreak: { darkness: 0.3, nostalgia: 0.25, intimacy: 0.2, aggression: -0.1 },
  healing: { warmth: 0.35, intimacy: 0.2, aggression: -0.2 },
  nostalgia: { nostalgia: 0.4, warmth: 0.15, darkness: 0.1 },
  loneliness: { darkness: 0.25, intimacy: 0.15, warmth: -0.1 },
  peace: { warmth: 0.25, aggression: -0.3, energy: -0.15 },
  longing: { intimacy: 0.25, nostalgia: 0.2, darkness: 0.1 },
  desire: { intimacy: 0.3, energy: 0.15, warmth: 0.1 },
  hope: { warmth: 0.25, energy: 0.1, aggression: -0.15 },
  acceptance: { warmth: 0.2, aggression: -0.2, energy: -0.05 },
  reflection: { nostalgia: 0.25, intimacy: 0.15, energy: -0.05 },
  vulnerability: { intimacy: 0.35, warmth: 0.1, aggression: -0.15 },
  romantic: { intimacy: 0.3, warmth: 0.25, energy: 0.05 },
  melancholy: { darkness: 0.25, nostalgia: 0.3, energy: -0.1 },
  comfort: { warmth: 0.3, intimacy: 0.2, aggression: -0.2 },
};

export const TEXTURE_VECTOR_MAP: Record<string, EmotionalVectorWeights> = {
  soft: { warmth: 0.25, intimacy: 0.2, aggression: -0.2 },
  warm: { warmth: 0.35, intimacy: 0.1 },
  acoustic: { warmth: 0.2, intimacy: 0.15, energy: -0.05 },
  ambient: { intimacy: 0.15, energy: -0.15, darkness: 0.1 },
  dark: { darkness: 0.35, aggression: 0.1, warmth: -0.1 },
  lush: { warmth: 0.2, intimacy: 0.15, energy: 0.05 },
  grainy: { nostalgia: 0.15, darkness: 0.1 },
  "reverb-heavy": { intimacy: 0.2, nostalgia: 0.15, darkness: 0.1 },
  minimal: { energy: -0.1, aggression: -0.15 },
  cinematic: { darkness: 0.2, nostalgia: 0.2 },
  floating: { intimacy: 0.15, energy: -0.1, warmth: 0.1 },
  organic: { warmth: 0.2, intimacy: 0.1 },
  electronic: { energy: 0.2, aggression: 0.05, warmth: -0.05 },
  soulful: { warmth: 0.3, intimacy: 0.25, nostalgia: 0.1 },
};

export const TIME_OF_DAY_VECTOR_MAP: Record<string, EmotionalVectorWeights> = {
  "late-night": { darkness: 0.35, intimacy: 0.2, energy: -0.15 },
  "night-drive": { darkness: 0.25, energy: 0.15, nostalgia: 0.15 },
  midnight: { darkness: 0.4, intimacy: 0.15, energy: -0.1 },
  morning: { warmth: 0.2, energy: 0.15, aggression: -0.1 },
  sunset: { warmth: 0.25, nostalgia: 0.2, intimacy: 0.1 },
  "rainy-evening": { darkness: 0.2, warmth: 0.15, nostalgia: 0.15 },
  "after-hours": { darkness: 0.3, intimacy: 0.2, energy: 0.05 },
  dawn: { warmth: 0.15, energy: 0.05, aggression: -0.15 },
  "quiet-afternoon": { warmth: 0.2, energy: -0.1, intimacy: 0.1 },
};

export const VOCAL_FEEL_VECTOR_MAP: Record<string, EmotionalVectorWeights> = {
  soft: { warmth: 0.25, intimacy: 0.25, aggression: -0.2 },
  breathy: { intimacy: 0.3, warmth: 0.15, energy: -0.05 },
  intimate: { intimacy: 0.4, warmth: 0.15 },
  soulful: { warmth: 0.3, intimacy: 0.25, nostalgia: 0.1 },
  whispered: { intimacy: 0.35, energy: -0.15, darkness: 0.05 },
  fragile: { intimacy: 0.3, warmth: 0.1, aggression: -0.1 },
  distant: { intimacy: -0.15, nostalgia: 0.15, darkness: 0.1 },
  warm: { warmth: 0.35, intimacy: 0.15 },
  emotional: { intimacy: 0.25, warmth: 0.2, nostalgia: 0.1 },
  airy: { intimacy: 0.15, energy: -0.05, warmth: 0.1 },
  smooth: { warmth: 0.2, aggression: -0.15, intimacy: 0.1 },
  raw: { aggression: 0.15, intimacy: 0.2, warmth: 0.05 },
};

export const INSTRUMENTATION_VECTOR_MAP: Record<string, EmotionalVectorWeights> =
  {
    piano: { intimacy: 0.2, warmth: 0.2, nostalgia: 0.15 },
    "acoustic-guitar": { warmth: 0.25, intimacy: 0.15, energy: -0.05 },
    "electric-guitar": { energy: 0.15, aggression: 0.1, warmth: 0.05 },
    "synth-pads": { intimacy: 0.15, darkness: 0.1, energy: -0.05 },
    strings: { nostalgia: 0.25, warmth: 0.15, intimacy: 0.1 },
    "soft-drums": { energy: 0.1, aggression: -0.1 },
    "live-drums": { energy: 0.25, aggression: 0.15 },
    bass: { energy: 0.15, darkness: 0.05 },
    "ambient-synths": { intimacy: 0.15, energy: -0.1, darkness: 0.1 },
    "minimal-percussion": { energy: -0.05, aggression: -0.1, intimacy: 0.05 },
    keys: { warmth: 0.15, energy: 0.05, intimacy: 0.1 },
    "vocal-layers": { intimacy: 0.25, warmth: 0.15 },
  };

export const TAG_VECTOR_MAPS = {
  atmosphere: ATMOSPHERE_VECTOR_MAP,
  emotion: EMOTION_VECTOR_MAP,
  texture: TEXTURE_VECTOR_MAP,
  timeOfDay: TIME_OF_DAY_VECTOR_MAP,
  vocalFeel: VOCAL_FEEL_VECTOR_MAP,
  instrumentation: INSTRUMENTATION_VECTOR_MAP,
} as const;

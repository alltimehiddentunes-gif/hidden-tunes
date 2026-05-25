export const ATMOSPHERE_OPTIONS = [
  "late-night",
  "healing",
  "cinematic",
  "dreamy",
  "intimate",
  "rainy",
  "calm",
  "ambient",
  "urban",
  "ethereal",
  "warm",
  "minimal",
  "night-drive",
  "reflective",
] as const;

export const EMOTION_OPTIONS = [
  "heartbreak",
  "healing",
  "nostalgia",
  "loneliness",
  "peace",
  "longing",
  "desire",
  "hope",
  "acceptance",
  "reflection",
  "vulnerability",
  "romantic",
  "melancholy",
  "comfort",
] as const;

export const TEXTURE_OPTIONS = [
  "soft",
  "warm",
  "acoustic",
  "ambient",
  "dark",
  "lush",
  "grainy",
  "reverb-heavy",
  "minimal",
  "cinematic",
  "floating",
  "organic",
  "electronic",
  "soulful",
] as const;

export const TIME_OF_DAY_OPTIONS = [
  "late-night",
  "night-drive",
  "midnight",
  "morning",
  "sunset",
  "rainy-evening",
  "after-hours",
  "dawn",
  "quiet-afternoon",
] as const;

export const VOCAL_FEEL_OPTIONS = [
  "soft",
  "breathy",
  "intimate",
  "soulful",
  "whispered",
  "fragile",
  "distant",
  "warm",
  "emotional",
  "airy",
  "smooth",
  "raw",
] as const;

export const INSTRUMENTATION_OPTIONS = [
  "piano",
  "acoustic-guitar",
  "electric-guitar",
  "synth-pads",
  "strings",
  "soft-drums",
  "live-drums",
  "bass",
  "ambient-synths",
  "minimal-percussion",
  "keys",
  "vocal-layers",
] as const;

export const ANALYSIS_STATUS_OPTIONS = [
  "pending",
  "queued",
  "analyzing",
  "ready",
  "failed",
  "manual",
] as const;

export const ANALYSIS_SOURCE_OPTIONS = [
  "manual",
  "admin_upload",
  "batch_v1",
  "external_provider",
] as const;

export type AtmosphereOption = (typeof ATMOSPHERE_OPTIONS)[number];
export type EmotionOption = (typeof EMOTION_OPTIONS)[number];
export type TextureOption = (typeof TEXTURE_OPTIONS)[number];
export type TimeOfDayOption = (typeof TIME_OF_DAY_OPTIONS)[number];
export type VocalFeelOption = (typeof VOCAL_FEEL_OPTIONS)[number];
export type InstrumentationOption = (typeof INSTRUMENTATION_OPTIONS)[number];
export type AnalysisStatusOption = (typeof ANALYSIS_STATUS_OPTIONS)[number];
export type AnalysisSourceOption = (typeof ANALYSIS_SOURCE_OPTIONS)[number];

export function isAllowedTaxonomyValue<T extends readonly string[]>(
  options: T,
  value: string | null | undefined
): value is T[number] {
  if (value == null) return false;
  const normalized = String(value).trim();
  if (!normalized) return false;
  return (options as readonly string[]).includes(normalized);
}

export type TaxonomySelectOption = {
  value: string;
  label: string;
};

export function buildTaxonomySelectOptions(
  options: readonly string[],
  currentValue: string | null | undefined
): TaxonomySelectOption[] {
  const normalized = String(currentValue || "").trim();
  const selectOptions: TaxonomySelectOption[] = [{ value: "", label: "—" }];
  const seen = new Set<string>();

  for (const option of options) {
    selectOptions.push({ value: option, label: option });
    seen.add(option);
  }

  if (normalized && !seen.has(normalized)) {
    selectOptions.push({
      value: normalized,
      label: `${normalized} (custom)`,
    });
  }

  return selectOptions;
}

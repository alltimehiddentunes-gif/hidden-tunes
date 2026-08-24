import { createHash } from "node:crypto";
import type { EmotionalProfile, LyricsProvenance } from "./types";

export const PROFILE_SCHEMA_VERSION = "music-emotional-profile-v1";
export const TAXONOMY_VERSION = "emotional-worlds-2026.08.1";
export type ReviewStatus = "unreviewed" | "accepted" | "corrected" | "rejected";

export type PersistedProfile = {
  profileSchemaVersion: typeof PROFILE_SCHEMA_VERSION;
  primaryEmotion: string; secondaryEmotions: string[]; themes: string[];
  intensity: number; direction: EmotionalProfile["direction"]; energy: number | null;
  genre: string; subgenre: string; language: string | null; worlds: string[];
  lyricsProvenance: LyricsProvenance; analysisSource: EmotionalProfile["analysisSource"];
  confidence: number; analyzerVersion: string; taxonomyVersion: string; analyzedAt: string;
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
};
export const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export function serializeProfile(profile: EmotionalProfile, analyzedAt = new Date().toISOString()): PersistedProfile {
  return { profileSchemaVersion: PROFILE_SCHEMA_VERSION, primaryEmotion: profile.primaryEmotion,
    secondaryEmotions: [...profile.secondaryEmotions], themes: [...profile.themes], intensity: profile.intensity,
    direction: profile.direction, energy: profile.energy, genre: profile.genre, subgenre: profile.subgenre,
    language: profile.language, worlds: [...profile.worlds], lyricsProvenance: profile.lyricsProvenance,
    analysisSource: profile.analysisSource, confidence: profile.confidence, analyzerVersion: profile.analyzerVersion,
    taxonomyVersion: TAXONOMY_VERSION, analyzedAt };
}

export function deserializeProfile(value: unknown): PersistedProfile {
  if (!value || typeof value !== "object") throw new Error("invalid emotional profile");
  const profile = value as PersistedProfile;
  if (profile.profileSchemaVersion !== PROFILE_SCHEMA_VERSION || !profile.primaryEmotion || !Array.isArray(profile.themes) || !Array.isArray(profile.worlds)) throw new Error("unsupported emotional profile");
  return { ...profile, secondaryEmotions: [...profile.secondaryEmotions], themes: [...profile.themes], worlds: [...profile.worlds] };
}

export function profileInputFingerprint(input: { lyricHash: string | null; analyzerVersion: string; taxonomyVersion?: string; profileVersion?: string; materialMetadata?: unknown }) {
  return sha256(stable({ lyricHash: input.lyricHash, analyzerVersion: input.analyzerVersion,
    taxonomyVersion: input.taxonomyVersion ?? TAXONOMY_VERSION,
    profileVersion: input.profileVersion ?? PROFILE_SCHEMA_VERSION, materialMetadata: input.materialMetadata ?? null }));
}

export function profileIsStale(stored: { inputFingerprint: string; reviewStatus: ReviewStatus }, currentFingerprint: string) {
  if (stored.reviewStatus === "corrected" || stored.reviewStatus === "accepted") return false;
  return stored.inputFingerprint !== currentFingerprint;
}

export function provenanceConfidenceCeiling(source: LyricsProvenance, reviewed: boolean) {
  if (reviewed && ["trusted_plain", "trusted_lrc"].includes(source)) return .99;
  if (["trusted_plain", "trusted_lrc"].includes(source)) return .94;
  if (source === "supplied") return .86;
  if (source === "whisper_transcription") return .7;
  return .55;
}

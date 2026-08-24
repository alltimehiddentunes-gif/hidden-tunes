import type { LyricsProvenance } from "./types";

const LRC_TIMESTAMP = /\[(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]|\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g;
const LRC_METADATA = /^\s*\[(?:ar|al|ti|by|offset|re|ve):[^\]]*\]\s*$/gim;

export function normalizeLyrics(value: unknown): string {
  return String(value ?? "")
    .replace(LRC_METADATA, " ")
    .replace(LRC_TIMESTAMP, " ")
    .replace(/<[^>]+>/g, " ")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function lyricsConfidence(provenance: LyricsProvenance, normalized: string): number {
  if (!normalized) return 0;
  const source = provenance === "trusted_plain" || provenance === "trusted_lrc" ? 0.9
    : provenance === "supplied" ? 0.84 : provenance === "whisper_transcription" ? 0.66 : 0.45;
  const length = Math.min(1, normalized.split(" ").length / 45);
  return Number((source * (0.72 + length * 0.28)).toFixed(3));
}

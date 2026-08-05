import type { EmotionalMetadataRaw } from "../types/music";
import { normalizeEmotionalMetadata } from "./normalizeEmotionalMetadata";

export type PersistedEmotionalMetadata = EmotionalMetadataRaw;

/** Store only the bounded canonical profile, never the complete API row. */
export function snapshotEmotionalMetadata(
  song: unknown
): PersistedEmotionalMetadata | undefined {
  return normalizeEmotionalMetadata(song).emotionalMetadataRaw || undefined;
}

/** Restore the shape consumed by the ingestion normalizer. */
export function restoreEmotionalMetadata(
  metadata: PersistedEmotionalMetadata | null | undefined
): Record<string, unknown> | undefined {
  return metadata ? { emotionalMetadata: metadata } : undefined;
}

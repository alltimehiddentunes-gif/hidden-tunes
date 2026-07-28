import { classifyAudiobookCompleteness } from "@/lib/audiobookDedup";

export type NormalizedAudiobookChapter = {
  sequenceNumber: number;
  chapterNumber: number;
  title: string;
  audioUrl: string;
  sourceFileId: string;
  mimeType: string;
  format: string;
  durationSeconds: number | null;
  artworkUrl?: string | null;
};

export type NormalizedAudiobookCandidate = {
  sourceKey: string;
  sourceType: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  subtitle?: string | null;
  authorName: string | null;
  narratorName: string | null;
  description: string | null;
  language: string | null;
  country?: string | null;
  coverUrl: string | null;
  licenseType: string;
  licenseUrl: string | null;
  rightsEvidence: string;
  publisher: string;
  categorySlug: string;
  categories: string[];
  genres?: string[];
  isbn?: string | null;
  publicationYear?: number | null;
  chapters: NormalizedAudiobookChapter[];
  durationSeconds: number;
  completeness: string;
  isComplete: boolean;
  isMature: boolean;
  explicit?: boolean;
};

export type AudiobookDiscoveryPage = {
  identifiers: string[];
  hasMore: boolean;
  nextPage: number;
  nextCursor?: string | null;
};

export type AudiobookSourceAdapter = {
  sourceKey: string;
  sourceName: string;
  catalogLane: "general" | "mature";
  discover: (input: {
    page: number;
    limit: number;
    cursor?: string | null;
    signal?: AbortSignal;
  }) => Promise<AudiobookDiscoveryPage>;
  fetchCandidate: (input: {
    identifier: string;
    signal?: AbortSignal;
  }) => Promise<NormalizedAudiobookCandidate | null>;
};

export function finalizeCandidateCompleteness(
  candidate: Omit<NormalizedAudiobookCandidate, "completeness" | "isComplete" | "durationSeconds"> & {
    durationSeconds?: number;
  }
): NormalizedAudiobookCandidate {
  const durationSeconds =
    candidate.durationSeconds ??
    candidate.chapters.reduce((sum, chapter) => sum + (chapter.durationSeconds || 0), 0);
  const completeness = classifyAudiobookCompleteness(
    candidate.chapters.length,
    durationSeconds
  );
  return {
    ...candidate,
    durationSeconds,
    completeness,
    isComplete: completeness === "complete" || completeness === "short_work",
  };
}

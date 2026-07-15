import { cleanText } from "@/lib/tvCatalog";

export function normalizeAudiobookTitleKey(value: unknown) {
  const raw = cleanText(value, 300) || "";
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

export function normalizeAudiobookAuthorKey(value: unknown) {
  return normalizeAudiobookTitleKey(value);
}

export function buildWorkDedupKey(input: {
  title: string;
  author?: string | null;
  language?: string | null;
}) {
  return [
    normalizeAudiobookTitleKey(input.title),
    normalizeAudiobookAuthorKey(input.author),
    normalizeAudiobookTitleKey(input.language || "unknown"),
  ].join("::");
}

export function buildEditionDedupKey(input: {
  workKey?: string | null;
  sourceType: string;
  sourceId: string;
  narrator?: string | null;
  language?: string | null;
}) {
  if (input.sourceType && input.sourceId) {
    return `${input.sourceType}:${input.sourceId}`;
  }
  return [
    input.workKey || "work",
    normalizeAudiobookAuthorKey(input.narrator),
    normalizeAudiobookTitleKey(input.language),
  ].join("::");
}

export function buildChapterDedupKey(input: {
  editionId: string;
  sequence: number;
  sourceFileId?: string | null;
}) {
  const filePart = cleanText(input.sourceFileId, 500) || `seq-${input.sequence}`;
  return `${input.editionId}::${input.sequence}::${filePart}`;
}

export function classifyAudiobookCompleteness(chapterCount: number, totalDurationSeconds: number) {
  if (chapterCount <= 0) return "partial";
  if (chapterCount === 1 && totalDurationSeconds > 0 && totalDurationSeconds < 900) {
    return "short_work";
  }
  if (chapterCount === 1) return "complete";
  return "complete";
}

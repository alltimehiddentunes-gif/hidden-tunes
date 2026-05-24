import type { SyncedLyricLine } from "./syncedLyricsTypes";
import {
  applySmartSpacingHelper,
  inferLineType,
  spreadLinesAcrossDuration,
  splitPlainLyricLines,
} from "./syncedLyricsUtils";

export type AutoSyncSpacingMode = "even" | "weighted";

export type AutoSyncLyricsOptions = {
  plainLyrics: string;
  durationSeconds: number;
  introDelaySeconds?: number;
  outroPaddingSeconds?: number;
  spacingMode?: AutoSyncSpacingMode;
};

export type AutoSyncValidation = {
  ok: boolean;
  warning?: string;
  error?: string;
};

const DEFAULT_INTRO_DELAY_SECONDS = 3;
const DEFAULT_OUTRO_PADDING_SECONDS = 2;
const FALLBACK_SECONDS_PER_LINE = 3;

export function validateAutoSyncInputs(
  plainLyrics: string,
  durationSeconds: number
): AutoSyncValidation {
  const lines = splitPlainLyricLines(plainLyrics);

  if (!lines.length) {
    return {
      ok: false,
      error: "Paste plain lyrics first — one line per row.",
    };
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return {
      ok: true,
      warning:
        "Track duration is not available yet. Draft timestamps will use a simple estimate until audio loads.",
    };
  }

  return { ok: true };
}

export function generateDraftSyncedLinesFromPlain(
  options: AutoSyncLyricsOptions
): SyncedLyricLine[] {
  const plainLines = splitPlainLyricLines(options.plainLyrics);
  if (!plainLines.length) return [];

  const introDelay = Math.max(0, options.introDelaySeconds ?? DEFAULT_INTRO_DELAY_SECONDS);
  const outroPadding = Math.max(0, options.outroPaddingSeconds ?? DEFAULT_OUTRO_PADDING_SECONDS);
  const spacingMode = options.spacingMode ?? "weighted";

  const seedLines: SyncedLyricLine[] = plainLines.map((text) => ({
    time: 0,
    text,
    type: inferLineType(text),
  }));

  const durationSeconds = options.durationSeconds;

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return seedLines.map((line, index) => ({
      ...line,
      time: introDelay + index * FALLBACK_SECONDS_PER_LINE,
    }));
  }

  if (spacingMode === "even") {
    return spreadLinesAcrossDuration(
      seedLines,
      durationSeconds,
      introDelay,
      outroPadding
    );
  }

  const endTime = Math.max(introDelay + 0.5, durationSeconds - outroPadding);
  const usableDuration = Math.max(0.5, endTime - introDelay);
  const weighted = applySmartSpacingHelper(seedLines, usableDuration);

  return weighted.map((line) => ({
    ...line,
    time: introDelay + line.time,
  }));
}

export function describeAutoSyncDraft(options: AutoSyncLyricsOptions) {
  const lines = generateDraftSyncedLinesFromPlain(options);
  return {
    lineCount: lines.length,
    firstTimestamp: lines[0]?.time ?? 0,
    lastTimestamp: lines[lines.length - 1]?.time ?? 0,
    spacingMode: options.spacingMode ?? "weighted",
  };
}

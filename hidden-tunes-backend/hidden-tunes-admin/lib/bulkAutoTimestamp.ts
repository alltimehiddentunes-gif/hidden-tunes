import type { SyncedLyricLine } from "@/lib/syncedLyricsTypes";
import {
  generateLrcFromSyncedLines,
  inferLineType,
  shiftAllSyncedLineTimes,
  sortSyncedLyricsByTime,
} from "@/lib/syncedLyricsUtils";

export type BulkAutoTimestampOptions = {
  plainLyrics: string;
  durationSeconds: number;
  globalOffsetSeconds: number;
  introSeconds: number;
  outroSeconds: number;
  /** 0.5 = tighter lines, 1 = default, 2 = wider spacing */
  spacingIntensity: number;
};

export type BulkAutoTimestampPreview = {
  plainLyrics: string;
  generatedLrc: string;
  syncedLines: SyncedLyricLine[];
  confidence: number;
  confidenceLabel: string;
  introEstimateSeconds: number;
  outroEstimateSeconds: number;
  lineCount: number;
  instrumentalGapCount: number;
  durationUsedSeconds: number;
  warning?: string;
};

const SECTION_MARKER_REGEX = /^\[(?!(\d{1,2}:\d{2}))[^\]]+\]$/i;
const FALLBACK_SECONDS_PER_LINE = 3;

export const DEFAULT_BULK_AUTO_TIMESTAMP_OPTIONS = {
  globalOffsetSeconds: 0,
  introSeconds: 3,
  outroSeconds: 2,
  spacingIntensity: 1,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampSpacingIntensity(value: number) {
  return clamp(value, 0.5, 2);
}

export function parsePlainLyricsWithGaps(plainLyrics: string) {
  const segments: Array<{ text: string; isGap: boolean }> = [];
  let pendingBlankLines = 0;

  plainLyrics.split(/\r?\n/).forEach((rawLine) => {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      pendingBlankLines += 1;
      return;
    }

    if (pendingBlankLines > 0) {
      segments.push({ text: "", isGap: true });
      pendingBlankLines = 0;
    }

    if (SECTION_MARKER_REGEX.test(trimmed)) {
      segments.push({ text: trimmed, isGap: true });
      return;
    }

    segments.push({ text: trimmed, isGap: false });
  });

  return segments;
}

function segmentsToSyncedSeed(segments: Array<{ text: string; isGap: boolean }>) {
  return segments.map((segment) => {
    if (segment.isGap) {
      const label = segment.text || "…";
      return {
        time: 0,
        text: label,
        type: inferLineType(label),
      } satisfies SyncedLyricLine;
    }

    return {
      time: 0,
      text: segment.text,
      type: inferLineType(segment.text),
    } satisfies SyncedLyricLine;
  });
}

function applySpacingIntensity(
  lines: SyncedLyricLine[],
  intensity: number,
  durationSeconds: number,
  introSeconds: number,
  outroSeconds: number
) {
  const safeIntensity = clampSpacingIntensity(intensity);
  if (!lines.length) return lines;

  const intro = Math.max(0, introSeconds);
  const effectiveDuration =
    durationSeconds > 0
      ? durationSeconds
      : Math.max(30, lines.length * FALLBACK_SECONDS_PER_LINE);
  const endTime = Math.max(intro + 0.5, effectiveDuration - Math.max(0, outroSeconds));
  const usableDuration = Math.max(0.5, endTime - intro);

  const weights = lines.map((line) => {
    if (line.type === "silence" || line.type === "instrumental" || line.type === "interlude") {
      return 2.4 * safeIntensity;
    }
    return Math.max(0.75, line.text.trim().length / 18) * safeIntensity;
  });

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || lines.length;
  let cursor = 0;

  return lines.map((line, index) => {
    const next = {
      ...line,
      time: intro + clamp((cursor / totalWeight) * usableDuration, 0, endTime),
    };
    cursor += weights[index] || 1;
    return next;
  });
}

function buildConfidence(input: {
  durationSeconds: number;
  lineCount: number;
  lastTimestamp: number;
  gapCount: number;
}) {
  let score = 55;

  if (input.durationSeconds > 0) {
    score += 25;
    const coverage = input.lastTimestamp / input.durationSeconds;
    if (coverage >= 0.55 && coverage <= 0.98) score += 12;
    else if (coverage > 0.35) score += 6;
    else score -= 8;
  } else {
    score -= 10;
  }

  if (input.lineCount >= 4) score += 6;
  if (input.gapCount > 0) score += 4;

  return clamp(Math.round(score), 20, 98);
}

function confidenceLabel(score: number) {
  if (score >= 85) return "High confidence";
  if (score >= 65) return "Good draft";
  if (score >= 45) return "Review recommended";
  return "Low confidence";
}

export function generateBulkAutoTimestampPreview(
  options: BulkAutoTimestampOptions
): BulkAutoTimestampPreview {
  const plainLyrics = String(options.plainLyrics || "").trim();
  const segments = parsePlainLyricsWithGaps(plainLyrics);
  const lyricSegments = segments.filter((segment) => !segment.isGap);
  const gapCount = segments.filter((segment) => segment.isGap).length;

  if (!lyricSegments.length) {
    return {
      plainLyrics,
      generatedLrc: "",
      syncedLines: [],
      confidence: 0,
      confidenceLabel: "No lyrics",
      introEstimateSeconds: options.introSeconds,
      outroEstimateSeconds: options.outroSeconds,
      lineCount: 0,
      instrumentalGapCount: 0,
      durationUsedSeconds: 0,
      warning: "Add plain lyric lines before generating timestamps.",
    };
  }

  const introSeconds = Math.max(0, options.introSeconds);
  const outroSeconds = Math.max(0, options.outroSeconds);
  const durationSeconds =
    options.durationSeconds > 0
      ? options.durationSeconds
      : Math.max(30, lyricSegments.length * FALLBACK_SECONDS_PER_LINE + gapCount * 4);

  let syncedLines = applySpacingIntensity(
    segmentsToSyncedSeed(segments),
    options.spacingIntensity,
    durationSeconds,
    introSeconds,
    outroSeconds
  );

  if (options.globalOffsetSeconds) {
    syncedLines = shiftAllSyncedLineTimes(syncedLines, options.globalOffsetSeconds);
  }

  syncedLines = sortSyncedLyricsByTime(syncedLines);
  const lastTimestamp = syncedLines[syncedLines.length - 1]?.time ?? introSeconds;
  const confidence = buildConfidence({
    durationSeconds: options.durationSeconds,
    lineCount: lyricSegments.length,
    lastTimestamp,
    gapCount,
  });

  return {
    plainLyrics,
    generatedLrc: generateLrcFromSyncedLines(syncedLines),
    syncedLines,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    introEstimateSeconds: introSeconds,
    outroEstimateSeconds: outroSeconds,
    lineCount: lyricSegments.length,
    instrumentalGapCount: gapCount,
    durationUsedSeconds: durationSeconds,
    warning:
      options.durationSeconds > 0
        ? undefined
        : "Track duration was estimated from line count. Adjust intro/outro if needed.",
  };
}

import { parseBuffer } from "music-metadata";

import {
  ATMOSPHERE_OPTIONS,
  EMOTION_OPTIONS,
  INSTRUMENTATION_OPTIONS,
  TEXTURE_OPTIONS,
  TIME_OF_DAY_OPTIONS,
  VOCAL_FEEL_OPTIONS,
  EMOTIONAL_ANALYSIS_AUTO_SOURCE,
} from "@/lib/emotionalTaxonomy";

export type EmotionalAnalysisSignals = {
  bpm: number | null;
  durationSeconds: number | null;
  bitrateKbps: number | null;
  codec: string | null;
  moodHint: string | null;
  genreHint: string | null;
};

export type EmotionalAnalysisSuggestionPayload = {
  energy: number | null;
  tempoBpm: number | null;
  atmosphere: string | null;
  emotion: string | null;
  texture: string | null;
  timeOfDay: string | null;
  vocalFeel: string | null;
  instrumentation: string | null;
  analysisStatus: "suggested";
  analysisSource: typeof EMOTIONAL_ANALYSIS_AUTO_SOURCE;
};

export type EmotionalSongAnalysisResult = {
  songId: string;
  title: string;
  status: "suggested" | "failed";
  error?: string;
  confidence: number;
  signals: EmotionalAnalysisSignals;
  suggestion: EmotionalAnalysisSuggestionPayload | null;
};

export type SongAnalysisInput = {
  id: string;
  title: string;
  audio_url?: string | null;
  url?: string | null;
  mood?: string | null;
  genre?: string | null;
  duration?: number | null;
  duration_seconds?: number | null;
};

const MAX_FETCH_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;

function normalizeHint(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickTaxonomyOption(
  options: readonly string[],
  hints: string[],
  fallbackIndex = 0
) {
  const normalizedHints = hints.filter(Boolean);

  for (const option of options) {
    const token = option.toLowerCase();
    if (
      normalizedHints.some(
        (hint) => hint.includes(token) || token.includes(hint.replace(/-/g, " "))
      )
    ) {
      return option;
    }
  }

  return options[fallbackIndex] || null;
}

function clampEnergy(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function estimateEnergyScore({
  bpm,
  bitrateKbps,
  moodHint,
  genreHint,
  durationSeconds,
}: {
  bpm: number | null;
  bitrateKbps: number | null;
  moodHint: string;
  genreHint: string;
  durationSeconds: number | null;
}) {
  let score = 42;

  if (bpm) {
    if (bpm >= 128) score += 24;
    else if (bpm >= 105) score += 14;
    else if (bpm <= 78) score -= 12;
    else score += 6;
  }

  if (bitrateKbps) {
    if (bitrateKbps >= 256) score += 8;
    else if (bitrateKbps <= 96) score -= 6;
  }

  if (durationSeconds && durationSeconds >= 300) {
    score -= 4;
  }

  if (
    /energetic|party|dance|upbeat|hype|afrobeat|drill|trap|club/.test(moodHint) ||
    /energetic|party|dance|upbeat|afrobeat|drill|trap|club/.test(genreHint)
  ) {
    score += 16;
  }

  if (
    /calm|peace|soft|ambient|healing|sleep|chill|relax|intimate|sad|melanch/.test(
      moodHint
    ) ||
    /ambient|classical|acoustic|folk|jazz|soul|ballad/.test(genreHint)
  ) {
    score -= 14;
  }

  return clampEnergy(score);
}

function inferEmotionalFields({
  bpm,
  energy,
  moodHint,
  genreHint,
  durationSeconds,
}: {
  bpm: number | null;
  energy: number;
  moodHint: string;
  genreHint: string;
  durationSeconds: number | null;
}) {
  const hints = [moodHint, genreHint];

  const atmosphere = pickTaxonomyOption(
    ATMOSPHERE_OPTIONS,
    [
      ...hints,
      energy >= 70 ? "urban cinematic" : "",
      energy <= 35 ? "calm healing intimate" : "",
      bpm && bpm <= 85 ? "late-night reflective rainy" : "",
      bpm && bpm >= 120 ? "urban night-drive" : "",
    ],
    energy <= 40 ? 7 : energy >= 65 ? 9 : 0
  );

  const emotion = pickTaxonomyOption(
    EMOTION_OPTIONS,
    [
      ...hints,
      /heartbreak|breakup|loss/.test(moodHint) ? "heartbreak longing" : "",
      /nostalg/.test(moodHint) ? "nostalgia" : "",
      /lonely|alone/.test(moodHint) ? "loneliness" : "",
      /peace|calm/.test(moodHint) ? "peace comfort" : "",
      /hope|uplift/.test(moodHint) ? "hope acceptance" : "",
      /romantic|love/.test(moodHint) ? "romantic desire" : "",
      energy <= 40 ? "melancholy reflection" : "",
      energy >= 70 ? "desire hope" : "",
    ],
    energy <= 40 ? 12 : 6
  );

  const texture = pickTaxonomyOption(
    TEXTURE_OPTIONS,
    [
      ...hints,
      energy >= 65 ? "electronic lush" : "",
      energy <= 40 ? "soft ambient minimal" : "",
      /acoustic|folk|piano/.test(genreHint) ? "acoustic organic warm" : "",
      /cinematic|orchestral/.test(genreHint) ? "cinematic reverb-heavy" : "",
    ],
    energy <= 40 ? 0 : 4
  );

  const timeOfDay = pickTaxonomyOption(
    TIME_OF_DAY_OPTIONS,
    [
      ...hints,
      bpm && bpm <= 85 ? "late-night midnight after-hours" : "",
      bpm && bpm >= 118 ? "night-drive after-hours" : "",
      energy <= 40 ? "quiet-afternoon dawn" : "",
      /sunset|evening/.test(moodHint) ? "sunset rainy-evening" : "",
      durationSeconds && durationSeconds >= 300 ? "late-night" : "",
    ],
    bpm && bpm <= 85 ? 0 : 1
  );

  const vocalFeel = pickTaxonomyOption(
    VOCAL_FEEL_OPTIONS,
    [
      ...hints,
      /intimate|soft|breathy/.test(moodHint) ? "intimate breathy soft" : "",
      /soul|gospel|rnb/.test(genreHint) ? "soulful emotional warm" : "",
      energy <= 40 ? "soft fragile intimate" : "",
      energy >= 65 ? "emotional raw" : "",
    ],
    2
  );

  const instrumentation = pickTaxonomyOption(
    INSTRUMENTATION_OPTIONS,
    [
      ...hints,
      /piano|keys/.test(genreHint) ? "piano keys" : "",
      /guitar|acoustic|folk/.test(genreHint) ? "acoustic-guitar" : "",
      /electronic|edm|house|techno|synth/.test(genreHint)
        ? "synth-pads ambient-synths"
        : "",
      /hip hop|rap|trap|drill/.test(genreHint) ? "bass soft-drums" : "",
      /orchestral|cinematic|strings/.test(genreHint) ? "strings" : "",
      bpm && bpm >= 110 ? "live-drums bass" : "soft-drums minimal-percussion",
    ],
    energy <= 40 ? 0 : 5
  );

  return {
    atmosphere,
    emotion,
    texture,
    timeOfDay,
    vocalFeel,
    instrumentation,
  };
}

async function fetchAudioSample(audioUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(audioUrl, {
      signal: controller.signal,
      headers: {
        Range: `bytes=0-${MAX_FETCH_BYTES - 1}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Audio fetch failed with status ${response.status}.`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (!buffer.length) {
      throw new Error("Audio fetch returned an empty file.");
    }

    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveAudioUrl(song: SongAnalysisInput) {
  return String(song.audio_url || song.url || "").trim() || null;
}

function resolveDurationSeconds(song: SongAnalysisInput) {
  const duration = Number(song.duration_seconds ?? song.duration ?? 0);
  return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null;
}

export async function analyzeSongEmotionalMetadata(
  song: SongAnalysisInput
): Promise<EmotionalSongAnalysisResult> {
  const audioUrl = resolveAudioUrl(song);
  const moodHint = normalizeHint(song.mood);
  const genreHint = normalizeHint(song.genre);
  const durationSeconds = resolveDurationSeconds(song);

  const baseSignals: EmotionalAnalysisSignals = {
    bpm: null,
    durationSeconds,
    bitrateKbps: null,
    codec: null,
    moodHint: song.mood || null,
    genreHint: song.genre || null,
  };

  if (!audioUrl) {
    return {
      songId: song.id,
      title: song.title,
      status: "failed",
      error: "Missing audio URL for analysis.",
      confidence: 0,
      signals: baseSignals,
      suggestion: null,
    };
  }

  try {
    const buffer = await fetchAudioSample(audioUrl);
    const metadata = await parseBuffer(buffer, {
      mimeType: "audio/mpeg",
    });

    const parsedDuration =
      metadata.format.duration && Number.isFinite(metadata.format.duration)
        ? Math.round(metadata.format.duration)
        : durationSeconds;

    const parsedBpm =
      metadata.common.bpm && Number.isFinite(metadata.common.bpm)
        ? Math.round(Number(metadata.common.bpm))
        : null;

    const bitrateKbps =
      metadata.format.bitrate && Number.isFinite(metadata.format.bitrate)
        ? Math.round(metadata.format.bitrate / 1000)
        : null;

    const signals: EmotionalAnalysisSignals = {
      bpm: parsedBpm,
      durationSeconds: parsedDuration,
      bitrateKbps,
      codec: metadata.format.codec || null,
      moodHint: song.mood || null,
      genreHint: song.genre || null,
    };

    const energy = estimateEnergyScore({
      bpm: parsedBpm,
      bitrateKbps,
      moodHint,
      genreHint,
      durationSeconds: parsedDuration,
    });

    const inferred = inferEmotionalFields({
      bpm: parsedBpm,
      energy,
      moodHint,
      genreHint,
      durationSeconds: parsedDuration,
    });

    const confidence =
      0.42 +
      (parsedBpm ? 0.22 : 0) +
      (bitrateKbps ? 0.08 : 0) +
      (moodHint ? 0.14 : 0) +
      (genreHint ? 0.1 : 0) +
      (parsedDuration ? 0.04 : 0);

    return {
      songId: song.id,
      title: song.title,
      status: "suggested",
      confidence: Math.min(0.95, Number(confidence.toFixed(2))),
      signals,
      suggestion: {
        energy,
        tempoBpm: parsedBpm,
        atmosphere: inferred.atmosphere,
        emotion: inferred.emotion,
        texture: inferred.texture,
        timeOfDay: inferred.timeOfDay,
        vocalFeel: inferred.vocalFeel,
        instrumentation: inferred.instrumentation,
        analysisStatus: "suggested",
        analysisSource: EMOTIONAL_ANALYSIS_AUTO_SOURCE,
      },
    };
  } catch (error: unknown) {
    return {
      songId: song.id,
      title: song.title,
      status: "failed",
      error: error instanceof Error ? error.message : "Audio analysis failed.",
      confidence: 0,
      signals: baseSignals,
      suggestion: null,
    };
  }
}

export function suggestionToDraft(
  suggestion: EmotionalAnalysisSuggestionPayload
) {
  return {
    energy: suggestion.energy != null ? String(suggestion.energy) : "",
    tempoBpm: suggestion.tempoBpm != null ? String(suggestion.tempoBpm) : "",
    atmosphere: suggestion.atmosphere || "",
    emotion: suggestion.emotion || "",
    texture: suggestion.texture || "",
    timeOfDay: suggestion.timeOfDay || "",
    vocalFeel: suggestion.vocalFeel || "",
    instrumentation: suggestion.instrumentation || "",
    analysisStatus: suggestion.analysisStatus,
    analysisSource: suggestion.analysisSource,
  };
}

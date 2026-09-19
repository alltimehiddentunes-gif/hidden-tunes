import type { AudioQualityResult, DownloadValidation } from "./qualificationTypes";
export type AudioQualityThresholds = { minDurationSeconds: number; hardMinimumDurationSeconds: number; minBitrate: number; maxBytes: number };
export const DEFAULT_AUDIO_THRESHOLDS: AudioQualityThresholds = { minDurationSeconds: 10, hardMinimumDurationSeconds: 1, minBitrate: 32_000, maxBytes: 100 * 1024 * 1024 };
export function evaluateAudioQuality(download: DownloadValidation, thresholds: Partial<AudioQualityThresholds> = {}): AudioQualityResult {
  const limits = { ...DEFAULT_AUDIO_THRESHOLDS, ...thresholds }; const reasons: string[] = [];
  if (download.status !== "DOWNLOAD_PASS") return { verdict: "AUDIO_FAIL", reasons: [download.error || "Media download/parse failed."], durationSeconds: null, codec: null, bitrate: null, sampleRate: null, channels: null, clipping: { detectable: false, detected: null }, silencePercentage: null, corruptDecodeErrors: [download.error || "download failed"] };
  if (download.bytes !== null && download.bytes > limits.maxBytes) reasons.push("File is larger than the configured maximum.");
  if (download.durationSeconds === null) reasons.push("Duration could not be decoded.");
  else if (download.durationSeconds < limits.hardMinimumDurationSeconds) reasons.push("Audio is suspiciously short.");
  else if (download.durationSeconds < limits.minDurationSeconds) reasons.push("Audio is shorter than the preferred threshold; retained as a warning.");
  if (download.bitrate !== null && download.bitrate < limits.minBitrate) reasons.push("Bitrate is below the preferred threshold; retained as a warning.");
  if (download.channels === 0) reasons.push("No audio channels were decoded.");
  const hard = reasons.some((r) => ["File is larger than the configured maximum.", "Duration could not be decoded.", "Audio is suspiciously short.", "No audio channels were decoded."].includes(r));
  return { verdict: hard ? "AUDIO_FAIL" : reasons.length ? "AUDIO_WARN" : "AUDIO_PASS", reasons, durationSeconds: download.durationSeconds, codec: download.codec, bitrate: download.bitrate, sampleRate: download.sampleRate, channels: download.channels, clipping: { detectable: false, detected: null }, silencePercentage: null, corruptDecodeErrors: [] };
}
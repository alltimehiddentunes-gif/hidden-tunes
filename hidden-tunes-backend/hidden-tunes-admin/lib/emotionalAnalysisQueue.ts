import type { EmotionalSongAnalysisResult } from "@/lib/emotionalAudioAnalysis";

export const EMOTIONAL_ANALYSIS_QUEUE_MAX = 25;
export const EMOTIONAL_ANALYSIS_THROTTLE_MS = 800;
export const EMOTIONAL_ANALYSIS_REQUEST_TIMEOUT_MS = 90_000;

export type EmotionalQueueItemStatus =
  | "pending"
  | "analyzing"
  | "completed"
  | "failed";

export type EmotionalQueueItem = {
  songId: string;
  title: string;
  status: EmotionalQueueItemStatus;
  error?: string;
  result?: EmotionalSongAnalysisResult;
};

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function serverSleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createQueueItems(
  tracks: Array<{ id: string; title: string }>
): EmotionalQueueItem[] {
  return tracks.map((track) => ({
    songId: track.id,
    title: track.title,
    status: "pending",
  }));
}

export function summarizeQueue(items: EmotionalQueueItem[]) {
  const pending = items.filter((item) => item.status === "pending").length;
  const analyzing = items.filter((item) => item.status === "analyzing").length;
  const completed = items.filter((item) => item.status === "completed").length;
  const failed = items.filter((item) => item.status === "failed").length;

  return {
    total: items.length,
    pending,
    analyzing,
    completed,
    failed,
    finished: completed + failed,
    progressPercent:
      items.length === 0
        ? 0
        : Math.round(((completed + failed) / items.length) * 100),
  };
}

export function queueStatusLabel(status: EmotionalQueueItemStatus) {
  switch (status) {
    case "pending":
      return "Pending";
    case "analyzing":
      return "Analyzing";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function queueStatusClass(status: EmotionalQueueItemStatus) {
  switch (status) {
    case "pending":
      return "bg-white/[0.08] text-white/55";
    case "analyzing":
      return "bg-yellow-400/15 text-yellow-200";
    case "completed":
      return "bg-emerald-400/15 text-emerald-200";
    case "failed":
      return "bg-red-400/15 text-red-200";
    default:
      return "bg-white/[0.08] text-white/55";
  }
}

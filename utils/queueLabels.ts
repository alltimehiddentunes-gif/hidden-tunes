/**
 * UI-only queue terminology. Does not affect playback, ordering, or Smart Queue.
 */

export type QueueContentKind =
  | "podcast"
  | "audiobook"
  | "motivation"
  | "lecture"
  | "music";

export type QueueLabels = {
  singular: string;
  plural: string;
  currentLabel: string;
  sessionLabel: string;
  positionLabel: (index: number, total: number) => string;
  remainingLabel: (count: number) => string;
  emptyCurrent: string;
  emptyNext: string;
  emptyNextHint: string;
  upNext: string;
  playedEarlier: string;
};

const LABELS: Record<QueueContentKind, QueueLabels> = {
  podcast: {
    singular: "Episode",
    plural: "Episodes",
    currentLabel: "Now Playing",
    sessionLabel: "Episode Queue",
    positionLabel: (index, total) => `Episode ${index} of ${total}`,
    remainingLabel: (count) =>
      `${count} episode${count === 1 ? "" : "s"} remaining`,
    emptyCurrent: "No episode playing",
    emptyNext: "Nothing queued next",
    emptyNextHint: "Episodes from this show will appear here in order.",
    upNext: "Up Next",
    playedEarlier: "Played Earlier",
  },
  audiobook: {
    singular: "Chapter",
    plural: "Chapters",
    currentLabel: "Current Chapter",
    sessionLabel: "Chapter Queue",
    positionLabel: (index, total) => `Chapter ${index} of ${total}`,
    remainingLabel: (count) =>
      `${count} chapter${count === 1 ? "" : "s"} remaining`,
    emptyCurrent: "No chapter playing",
    emptyNext: "Nothing queued next",
    emptyNextHint: "Chapters from this book will appear here in order.",
    upNext: "Up Next",
    playedEarlier: "Played Earlier",
  },
  motivation: {
    singular: "Talk",
    plural: "Talks",
    currentLabel: "Current Talk",
    sessionLabel: "Talk Queue",
    positionLabel: (index, total) => `Talk ${index} of ${total}`,
    remainingLabel: (count) =>
      `${count} talk${count === 1 ? "" : "s"} remaining`,
    emptyCurrent: "No talk playing",
    emptyNext: "Nothing queued next",
    emptyNextHint: "Talks from this session will appear here in order.",
    upNext: "Up Next",
    playedEarlier: "Played Earlier",
  },
  lecture: {
    singular: "Lecture",
    plural: "Lectures",
    currentLabel: "Current Lecture",
    sessionLabel: "Lecture Queue",
    positionLabel: (index, total) => `Lecture ${index} of ${total}`,
    remainingLabel: (count) =>
      `${count} lecture${count === 1 ? "" : "s"} remaining`,
    emptyCurrent: "No lecture playing",
    emptyNext: "Nothing queued next",
    emptyNextHint: "Lectures from this program will appear here in order.",
    upNext: "Up Next",
    playedEarlier: "Played Earlier",
  },
  music: {
    singular: "Track",
    plural: "Tracks",
    currentLabel: "Now Playing",
    sessionLabel: "Music Queue",
    positionLabel: (index, total) => `Track ${index} of ${total}`,
    remainingLabel: (count) =>
      `${count} track${count === 1 ? "" : "s"} remaining`,
    emptyCurrent: "No song playing",
    emptyNext: "Nothing queued next",
    emptyNextHint: "Album and radio sessions will appear here in playback order.",
    upNext: "Up Next",
    playedEarlier: "Played Earlier",
  },
};

export function getQueueLabels(kind: QueueContentKind): QueueLabels {
  return LABELS[kind] || LABELS.music;
}

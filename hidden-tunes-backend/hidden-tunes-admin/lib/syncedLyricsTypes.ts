export type SyncedLyricLineType =
  | "lyric"
  | "instrumental"
  | "interlude"
  | "silence";

export type SyncedLyricLine = {
  time: number;
  text: string;
  type: SyncedLyricLineType;
};

export type SyncedLyricsPayload = {
  lyricsJson: SyncedLyricLine[];
  lyricsLrc: string;
  plainLyrics: string;
  version?: number;
};

export const INTERLUDE_PRESETS: Array<{
  id: string;
  label: string;
  text: string;
  type: SyncedLyricLineType;
}> = [
  { id: "instrumental", label: "Instrumental", text: "♪ Instrumental ♪", type: "instrumental" },
  { id: "guitar-solo", label: "Guitar Solo", text: "♪ Guitar Solo ♪", type: "instrumental" },
  { id: "piano-break", label: "Piano Break", text: "♪ Piano Break ♪", type: "instrumental" },
  { id: "bridge", label: "Bridge", text: "♪ Bridge ♪", type: "interlude" },
  { id: "outro", label: "Outro", text: "♪ Outro ♪", type: "interlude" },
  { id: "silence", label: "Silence", text: "…", type: "silence" },
];

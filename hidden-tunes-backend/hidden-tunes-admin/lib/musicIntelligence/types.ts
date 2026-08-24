export type JourneyMode = "CONTINUE" | "DEEPEN" | "RECOVER" | "UPLIFT";
export type LyricsProvenance = "trusted_plain" | "trusted_lrc" | "supplied" | "whisper_transcription" | "none";
export type EmotionalDirection = "descending" | "static" | "recovering" | "rising" | "victorious" | "unresolved" | "cathartic";

export type EmotionalProfile = {
  primaryEmotion: string;
  secondaryEmotions: string[];
  themes: string[];
  intensity: number;
  direction: EmotionalDirection;
  energy: number | null;
  genre: string;
  subgenre: string;
  language: string | null;
  worlds: string[];
  lyricsProvenance: LyricsProvenance;
  analysisSource: "deterministic_lyrics_v1" | "metadata_fallback_v1";
  confidence: number;
  analyzerVersion: "music-intelligence-lab-2026.08.1";
};

export type LabSong = {
  id: string; title: string; artistId: string; albumId: string; genre: string;
  subgenre?: string; mood?: string; tags?: string[]; language?: string;
  energy?: number; lyrics?: string; lyricsProvenance?: LyricsProvenance;
  playable: boolean; published: boolean; maturity: "safe" | "mature";
};

export type ListenerSignals = {
  completions: Record<string, number>; replays: Record<string, number>;
  favorites: string[]; librarySaves: string[]; playlistAdds: string[];
  followedArtists: string[]; immediateSkips: string[]; lateSkips: string[];
  recentlyPlayed: string[];
};

export type ScoreComponents = {
  emotional: number; thematic: number; direction: number; journey: number;
  genre: number; artist: number; user: number; energy: number; freshness: number;
  repetitionPenalty: number; skipPenalty: number; final: number;
};

export type RankedCandidate = { song: LabSong; profile: EmotionalProfile; components: ScoreComponents; reasons: string[] };
export type RankInput = {
  seed: LabSong; candidates: LabSong[]; journey: JourneyMode; listener: ListenerSignals;
  existingQueueIds?: string[]; allowMature?: boolean; limit?: number; candidateLimit?: number;
  profileCache?: ReadonlyMap<string, EmotionalProfile>;
};

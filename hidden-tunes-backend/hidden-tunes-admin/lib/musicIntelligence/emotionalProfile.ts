import { EMOTIONAL_WORLD_REGISTRY } from "../emotionalWorldRegistry";
import { lyricsConfidence, normalizeLyrics } from "./lyricsNormalization";
import type { EmotionalDirection, EmotionalProfile, LabSong } from "./types";

type Lexicon = { emotion: string; worlds: string[]; themes: string[]; tokens: string[]; intensity: number };
const LEXICON: Lexicon[] = [
  { emotion: "heartbreak", worlds: ["heartbreak", "melancholy"], themes: ["breakup", "betrayal"], tokens: ["broken heart", "goodbye", "left me", "betrayed", "tears", "heartbreak"], intensity: .82 },
  { emotion: "longing", worlds: ["missing-you", "melancholy"], themes: ["distance", "reconnection"], tokens: ["miss you", "missing you", "come back", "far away", "waiting for you", "yearning"], intensity: .68 },
  { emotion: "grief", worlds: ["grief-and-loss", "melancholy"], themes: ["loss", "remembrance"], tokens: ["gone forever", "rest in peace", "mourning", "grief", "lost you", "memory remains"], intensity: .88 },
  { emotion: "reflection", worlds: ["reflection"], themes: ["identity", "life-lessons"], tokens: ["looking back", "learned", "remember when", "inside myself", "who i am", "life lesson"], intensity: .45 },
  { emotion: "acceptance", worlds: ["healing", "calm"], themes: ["acceptance", "release"], tokens: ["let you go", "accept", "at peace", "moving on", "release", "forgive"], intensity: .48 },
  { emotion: "hope", worlds: ["healing", "motivational"], themes: ["hope", "renewal"], tokens: ["new day", "hope", "light ahead", "begin again", "better days", "tomorrow"], intensity: .58 },
  { emotion: "worship", worlds: ["spiritual-peace"], themes: ["faith", "worship"], tokens: ["lord", "god", "holy", "worship", "faith", "saviour", "savior"], intensity: .62 },
  { emotion: "surrender", worlds: ["spiritual-peace", "calm"], themes: ["surrender", "faith"], tokens: ["i surrender", "your will", "kneel", "in your hands", "trust you"], intensity: .55 },
  { emotion: "gratitude", worlds: ["gratitude", "spiritual-peace"], themes: ["gratitude", "grace"], tokens: ["thank you", "grateful", "thankful", "blessed", "grace"], intensity: .62 },
  { emotion: "triumph", worlds: ["celebration", "confidence"], themes: ["victory", "achievement"], tokens: ["victory", "overcome", "we won", "conquer", "champion", "triumph"], intensity: .86 },
  { emotion: "celebration", worlds: ["celebration", "happy"], themes: ["party", "celebration"], tokens: ["party", "dance all night", "celebrate", "turn up", "champagne", "good time"], intensity: .8 },
  { emotion: "confidence", worlds: ["confidence", "motivational"], themes: ["identity", "success"], tokens: ["i can", "fearless", "stronger", "my power", "believe in me", "unstoppable"], intensity: .76 },
  { emotion: "motivation", worlds: ["motivational", "energetic"], themes: ["perseverance", "growth"], tokens: ["keep going", "rise up", "never give up", "work hard", "dream big", "push through"], intensity: .74 },
  { emotion: "romantic", worlds: ["romantic"], themes: ["devotion", "intimacy"], tokens: ["forever with you", "hold you", "my love", "kiss", "devotion", "together forever"], intensity: .64 },
];

const RECOVERY = ["heartbreak", "grief", "longing", "reflection", "acceptance", "hope", "confidence", "triumph"];
const RISING = ["surrender", "gratitude", "hope", "confidence", "motivation", "triumph", "celebration"];
const norm = (v: unknown) => String(v ?? "").toLowerCase().trim();
const hits = (text: string, values: string[]) => values.reduce((n, token) => n + (text.includes(token) ? 1 : 0), 0);

function inferDirection(text: string, primary: string): EmotionalDirection {
  if (hits(text, ["but now", "now i", "still i rise", "moving on", "better days", "begin again"])) return "recovering";
  if (hits(text, ["victory", "overcome", "conquer", "we won", "champion"])) return "victorious";
  if (hits(text, ["let it out", "cry it out", "release the pain"])) return "cathartic";
  if (hits(text, ["no way out", "forever alone", "nothing remains", "never heal"])) return "descending";
  if (["heartbreak", "grief", "longing"].includes(primary)) return "unresolved";
  if (RISING.includes(primary)) return "rising";
  return "static";
}

export function buildEmotionalProfile(song: LabSong): EmotionalProfile {
  const lyrics = normalizeLyrics(song.lyrics);
  const metadata = [song.mood, song.genre, song.subgenre, ...(song.tags ?? [])].map(norm).join(" ");
  const sourceText = lyrics || metadata;
  const scored = LEXICON.map((entry) => ({ entry, score: hits(sourceText, entry.tokens) }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || b.entry.intensity - a.entry.intensity);
  const primary = scored[0]?.entry.emotion || norm(song.mood) || "unknown";
  const secondaries = [...new Set(scored.slice(1, 4).map(({ entry }) => entry.emotion))];
  const themes = [...new Set(scored.flatMap(({ entry }) => entry.themes))].slice(0, 6);
  const worlds = [...new Set(scored.flatMap(({ entry }) => entry.worlds))]
    .filter((id) => EMOTIONAL_WORLD_REGISTRY.some((world) => world.id === id)).slice(0, 3);
  const provenance = lyrics ? song.lyricsProvenance ?? "supplied" : "none";
  const lyricConfidence = lyricsConfidence(provenance, lyrics);
  const confidence = lyrics ? (scored.length ? Math.min(.96, lyricConfidence + Math.min(.12, scored.length * .025)) : .42)
    : Math.min(.55, .24 + (song.mood ? .14 : 0) + (song.tags?.length ? .1 : 0) + (song.energy != null ? .07 : 0));
  const intensity = scored.length ? Math.max(...scored.map(({ entry }) => entry.intensity)) : Math.min(1, Math.max(0, (song.energy ?? 50) / 100));
  return {
    primaryEmotion: primary, secondaryEmotions: secondaries, themes,
    intensity, direction: inferDirection(sourceText, primary), energy: song.energy ?? null,
    genre: norm(song.genre), subgenre: norm(song.subgenre), language: song.language ?? null,
    worlds, lyricsProvenance: provenance,
    analysisSource: lyrics ? "deterministic_lyrics_v1" : "metadata_fallback_v1",
    confidence: Number(confidence.toFixed(3)), analyzerVersion: "music-intelligence-lab-2026.08.1",
  };
}

export function emotionalStage(emotion: string): number {
  const recovery = RECOVERY.indexOf(emotion); if (recovery >= 0) return recovery;
  const rising = RISING.indexOf(emotion); return rising >= 0 ? rising + 3 : 3;
}

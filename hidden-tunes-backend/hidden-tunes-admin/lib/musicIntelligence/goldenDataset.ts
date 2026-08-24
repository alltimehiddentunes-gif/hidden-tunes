import type { LabSong, ListenerSignals } from "./types";

const song = (id: string, title: string, artistId: string, albumId: string, genre: string, mood: string, energy: number, lyrics: string | undefined, tags: string[] = [], extra: Partial<LabSong> = {}): LabSong => ({
  id, title, artistId, albumId, genre, mood, energy, lyrics, tags, language: "en",
  lyricsProvenance: lyrics ? "supplied" : "none", playable: true, published: true, maturity: "safe", ...extra,
});

// All lyric fragments are synthetic test annotations, not catalog lyrics.
export const GOLDEN_SONGS: LabSong[] = [
  song("afro-heart", "Distant Light", "a1", "al1", "Afrobeats", "heartbreak", 48, "You left me waiting far away, my broken heart still calls; no way out tonight"),
  song("afro-party", "All Night Gold", "a2", "al2", "Afrobeats", "party", 88, "We party and dance all night, celebrate the good time"),
  song("soul-long", "Across the Rain", "a3", "al3", "Soul", "longing", 42, "I miss you, come back; I am waiting for you far away"),
  song("afro-accept", "Letting Go", "a4", "al4", "Afrobeats", "healing", 52, "My heart was broken but now I let you go, forgive and begin again"),
  song("rnb-reflect", "Mirror After Midnight", "a5", "al5", "R&B", "reflection", 38, "Looking back I learned who I am; moving on toward better days"),
  song("gospel-victory", "Victory Is Here", "g1", "gl1", "Gospel", "victory", 82, "Lord, victory is here; by faith we overcome and conquer"),
  song("gospel-grief", "Tears at the Altar", "g2", "gl2", "Gospel", "grief", 30, "Lord I mourn, lost you, tears and grief remain, nothing remains"),
  song("worship-triumph", "Faith Has Won", "g3", "gl3", "Worship", "triumph", 75, "Holy God, our faith has overcome; we won the victory"),
  song("worship-surrender", "In Your Hands", "g4", "gl4", "Worship", "surrender", 36, "I surrender, your will, I trust you, Lord, in your hands"),
  song("gospel-grateful", "Thankful Dawn", "g5", "gl5", "Gospel", "gratitude", 62, "Thank you Lord, grateful and blessed by grace at dawn"),
  song("amapiano-party", "Floor Lights", "p1", "pl1", "Amapiano", "party", 90, "Turn up, party, dance all night and celebrate"),
  song("amapiano-hope", "Tomorrow Grooves", "p2", "pl2", "Amapiano", "hope", 66, "A new day brings hope, light ahead and better days"),
  song("dancehall-love", "Hold Me Close", "d1", "dl1", "Dancehall", "romantic", 70, "My love, hold you close, together forever"),
  song("dancehall-betray", "False Promise", "d2", "dl2", "Dancehall", "heartbreak", 72, "You betrayed my broken heart and left me with tears"),
  song("grief-deep", "Memory Remains", "s1", "sl1", "Soul", "grief", 24, "Gone forever, I mourn; your memory remains"),
  song("grief-heal", "Morning After Loss", "s2", "sl2", "Soul", "healing", 40, "I lost you, but now the new day brings acceptance and peace"),
  song("reflect-confidence", "Know My Name", "r1", "rl1", "Pop", "confidence", 68, "Looking back I know who I am; fearless, stronger and unstoppable"),
  song("motivation-rise", "Keep Going", "m1", "ml1", "Hip-Hop", "motivation", 85, "Keep going, rise up, never give up and push through"),
  song("confidence-afro", "My Power", "m2", "ml2", "Afrobeats", "confidence", 78, "I know my power, fearless and stronger; I can overcome"),
  song("calm-peace", "Quiet Water", "c1", "cl1", "Ambient", "peace", 18, "At peace, breathe, release and rest in quiet light"),
  song("nostalgia", "Old Street", "n1", "nl1", "Highlife", "nostalgia", 44, "Remember when, looking back at our old days and home"),
  song("ambiguous", "Blue Fire", "x1", "xl1", "Alternative", "moody", 55, "Blue fire turns in circles under an open sky"),
  song("no-lyrics-afro", "Instrumental Pulse", "x2", "xl2", "Afrobeats", "energetic", 80, undefined, ["energetic", "dance"]),
  song("no-lyrics-calm", "Still Air", "x3", "xl3", "Ambient", "calm", 15, undefined, ["calm", "healing"]),
  song("same-artist-1", "Echo One", "a1", "al6", "Afrobeats", "party", 86, "Party and dance all night"),
  song("same-artist-2", "Echo Two", "a1", "al7", "Afrobeats", "party", 84, "Celebrate the good time"),
  song("same-artist-3", "Echo Three", "a1", "al8", "Afrobeats", "party", 83, "Turn up and party"),
  song("unplayable", "Unavailable", "z1", "zl1", "Afrobeats", "heartbreak", 45, "Broken heart", [], { playable: false }),
  song("unpublished", "Private Draft", "z2", "zl2", "Gospel", "victory", 75, "Victory", [], { published: false }),
  song("mature", "Restricted", "z3", "zl3", "Afrobeats", "party", 90, "Party", [], { maturity: "mature" }),
];

export const EMPTY_LISTENER: ListenerSignals = {
  completions: {}, replays: {}, favorites: [], librarySaves: [], playlistAdds: [],
  followedArtists: [], immediateSkips: [], lateSkips: [], recentlyPlayed: [],
};

export const GOLDEN_SEED_IDS = ["afro-heart", "gospel-victory", "grief-deep", "worship-surrender", "motivation-rise", "dancehall-betray", "no-lyrics-afro", "ambiguous"];

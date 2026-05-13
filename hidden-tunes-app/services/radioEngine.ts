import AsyncStorage from "@react-native-async-storage/async-storage";
import { searchYouTubeBackend } from "./youtubeBackend";

const RADIO_QUEUE_KEY = "hidden_tunes_radio_queue_v1";
const RADIO_SESSION_KEY = "hidden_tunes_radio_session_v2";

export type RadioTrack = {
  id: string;
  title: string;
  artist: string;
  channelTitle: string;
  thumbnail: string;
  source: "youtube";
  type: "youtube";
  isOnline: true;
};

export type HiddenTunesRadioSession = {
  id: string;
  seedTrack: RadioTrack;
  queue: RadioTrack[];
  history: RadioTrack[];
  blockedFingerprints: string[];
  reason: string;
  genre: string;
  mood: string;
  createdAt: number;
  updatedAt: number;
};

function cleanText(value: any, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function makeFingerprint(track: any) {
  return `${track?.id || ""}-${track?.title || ""}-${
    track?.artist || track?.channelTitle || ""
  }`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function normalizeRadioTrack(track: any): RadioTrack {
  const artist = cleanText(
    track?.artist || track?.channelTitle,
    "Unknown Artist"
  );

  return {
    id: cleanText(track?.id || track?.videoId, `${artist}-${track?.title}`),
    title: cleanText(track?.title, "Unknown Song"),
    artist,
    channelTitle: cleanText(track?.channelTitle || artist, artist),
    thumbnail: cleanText(track?.thumbnail || track?.artwork || track?.cover, ""),
    source: "youtube",
    type: "youtube",
    isOnline: true,
  };
}

function dedupeRadioTracks(tracks: RadioTrack[]) {
  const seen = new Set<string>();

  return tracks.filter((track) => {
    const key = makeFingerprint(track);

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function guessGenre(text: string) {
  const value = String(text || "").toLowerCase();

  if (value.includes("afro")) return "Afrobeats";
  if (value.includes("amapiano")) return "Amapiano";
  if (value.includes("gospel") || value.includes("worship")) return "Gospel";
  if (value.includes("rap") || value.includes("hip hop")) return "Hip-Hop";
  if (value.includes("r&b") || value.includes("soul")) return "R&B";
  if (value.includes("reggae")) return "Reggae";
  if (value.includes("dancehall")) return "Dancehall";
  if (value.includes("pop")) return "Pop";

  return "Mixed";
}

function guessMood(text: string) {
  const value = String(text || "").toLowerCase();

  if (value.includes("love")) return "Romantic";
  if (value.includes("sad") || value.includes("lonely")) return "Emotional";
  if (value.includes("party") || value.includes("dance")) return "Energetic";
  if (value.includes("worship") || value.includes("god")) return "Spiritual";
  if (value.includes("toxic") || value.includes("betray")) return "Dark";

  return "Vibe";
}

async function searchRadioQueries(queries: string[]) {
  const cleanQueries = queries
    .map((query) => cleanText(query))
    .filter((query) => query.length > 0);

  const responses = await Promise.all(
    cleanQueries.slice(0, 3).map((query) => searchYouTubeBackend(query))
  );

  return dedupeRadioTracks(
    responses.flat().filter(Boolean).map(normalizeRadioTrack)
  );
}

export async function buildRelatedRadioQueue(seed: {
  title?: string;
  artist?: string;
  channelTitle?: string;
}) {
  const title = cleanText(seed.title);
  const artist = cleanText(seed.artist || seed.channelTitle);

  return searchRadioQueries([
    `${artist} ${title} songs`,
    artist ? `${artist} songs` : "",
    artist ? `${artist} latest songs` : "",
    title ? `${title} similar songs` : "",
  ]);
}

export async function buildPersonalRadioQueue() {
  return searchRadioQueries([
    "trending afrobeats songs",
    "popular music songs",
    "latest youtube music",
  ]);
}

export async function extendRadioQueue(
  currentQueue: RadioTrack[],
  seedTrack?: RadioTrack
) {
  const seed = seedTrack || currentQueue[currentQueue.length - 1];

  if (!seed) return currentQueue;

  const extraTracks = await buildRelatedRadioQueue({
    title: seed.title,
    artist: seed.artist,
    channelTitle: seed.channelTitle,
  });

  return dedupeRadioTracks([...currentQueue, ...extraTracks]);
}

export async function saveRadioQueue(queue: RadioTrack[]) {
  await AsyncStorage.setItem(
    RADIO_QUEUE_KEY,
    JSON.stringify(queue.map(normalizeRadioTrack))
  );
}

export async function loadRadioQueue() {
  try {
    const stored = await AsyncStorage.getItem(RADIO_QUEUE_KEY);

    if (!stored) return [];

    const parsed = JSON.parse(stored);

    if (!Array.isArray(parsed)) return [];

    return parsed.map(normalizeRadioTrack);
  } catch {
    return [];
  }
}

export async function clearRadioQueue() {
  await AsyncStorage.removeItem(RADIO_QUEUE_KEY);
}

export async function createRadioSession(seedTrack: any, library: any[] = []) {
  const normalizedSeed = normalizeRadioTrack(seedTrack);

  const genre = guessGenre(`${normalizedSeed.title} ${normalizedSeed.artist}`);
  const mood = guessMood(`${normalizedSeed.title} ${normalizedSeed.artist}`);

  const queue =
    library.length > 0
      ? dedupeRadioTracks(library.map(normalizeRadioTrack))
      : await buildRelatedRadioQueue({
          title: normalizedSeed.title,
          artist: normalizedSeed.artist,
          channelTitle: normalizedSeed.channelTitle,
        });

  const session: HiddenTunesRadioSession = {
    id: `radio-${makeFingerprint(normalizedSeed)}-${Date.now()}`,
    seedTrack: normalizedSeed,
    queue,
    history: [normalizedSeed],
    blockedFingerprints: [makeFingerprint(normalizedSeed)],
    reason: `Because you played ${normalizedSeed.title}`,
    genre,
    mood,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveRadioSession(session);

  return session;
}

export async function expandRadioSession(
  session: HiddenTunesRadioSession,
  library: any[] = []
) {
  const seed = session.queue[0] || session.seedTrack;

  const extraTracks =
    library.length > 0
      ? library.map(normalizeRadioTrack)
      : await buildRelatedRadioQueue({
          title: seed.title,
          artist: seed.artist,
          channelTitle: seed.channelTitle,
        });

  const updated: HiddenTunesRadioSession = {
    ...session,
    queue: dedupeRadioTracks([...session.queue, ...extraTracks]),
    blockedFingerprints: Array.from(
      new Set([
        ...session.blockedFingerprints,
        ...extraTracks.map(makeFingerprint),
      ])
    ),
    updatedAt: Date.now(),
  };

  await saveRadioSession(updated);

  return updated;
}

export async function getNextRadioTrack(
  session: HiddenTunesRadioSession,
  library: any[] = []
) {
  let workingSession = session;

  if (workingSession.queue.length <= 2) {
    workingSession = await expandRadioSession(workingSession, library);
  }

  const nextTrack = workingSession.queue[0];

  if (!nextTrack) {
    return {
      nextTrack: null,
      session: workingSession,
    };
  }

  const updatedSession: HiddenTunesRadioSession = {
    ...workingSession,
    queue: workingSession.queue.slice(1),
    history: dedupeRadioTracks([...workingSession.history, nextTrack]),
    blockedFingerprints: Array.from(
      new Set([
        ...workingSession.blockedFingerprints,
        makeFingerprint(nextTrack),
      ])
    ),
    updatedAt: Date.now(),
  };

  await saveRadioSession(updatedSession);

  return {
    nextTrack,
    session: updatedSession,
  };
}

export async function recoverRadioSession(
  session: HiddenTunesRadioSession,
  library: any[] = []
) {
  const recovered = await expandRadioSession(session, library);

  if (recovered.queue.length > 0) return recovered;

  return createRadioSession(session.seedTrack, library);
}

export async function saveRadioSession(session: HiddenTunesRadioSession) {
  await AsyncStorage.setItem(RADIO_SESSION_KEY, JSON.stringify(session));
}

export async function loadRadioSession() {
  try {
    const stored = await AsyncStorage.getItem(RADIO_SESSION_KEY);

    if (!stored) return null;

    return JSON.parse(stored) as HiddenTunesRadioSession;
  } catch {
    return null;
  }
}

export async function clearRadioSession() {
  await AsyncStorage.removeItem(RADIO_SESSION_KEY);
}
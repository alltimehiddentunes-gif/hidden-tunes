import type { AppSong } from "@/context/PlayerContext";
import type { PlaybackQueueContext } from "@/context/PlayerContext";
import type { EducationalProgram, EducationalSessionPlayItem } from "@/types/education";

export const EDUCATIONAL_SESSION_SONG_PREFIX = "lecture-session-";
export const EDUCATIONAL_QUEUE_TYPE = "educational";
export const EDUCATIONAL_PROGRAM_CONTEXT_TYPE = "educational-program";
export const EDUCATIONAL_RESTART_THRESHOLD_MS = 3000;
export const EDUCATIONAL_MAX_AUTO_NEXT_FAILURES = 3;

export function educationalSessionSongId(sessionId: string) {
  return `${EDUCATIONAL_SESSION_SONG_PREFIX}${sessionId}`;
}

export function parseEducationalSessionSongId(songId?: string | null) {
  const clean = String(songId || "");
  if (!clean.startsWith(EDUCATIONAL_SESSION_SONG_PREFIX)) return null;
  return clean.slice(EDUCATIONAL_SESSION_SONG_PREFIX.length) || null;
}

export function isEducationalSessionAppSong(song?: AppSong | null) {
  return Boolean(parseEducationalSessionSongId(song?.id));
}

export function isEducationalProgressiveMediaUrl(playableUrl: string) {
  const url = String(playableUrl || "").trim();
  if (!/^https:\/\//i.test(url)) return false;
  // Match extension in the path (before query). Avoid treating HLS/DASH as progressive.
  if (/\.(m3u8|mpd)(?:\?|$)/i.test(url)) return false;
  return /\.(mp3|m4a|aac|wav|ogg|mp4)(?:\?|$)/i.test(url);
}

/**
 * Lectures progressive MP3/MP4 play through shared HiddenAudio — never TV.
 * Scoped to educational playback only (callers must already be on the lecture path).
 */
export function isEducationalAudioPlayback(
  mediaType: string,
  playableUrl: string,
  mimeType?: string | null
) {
  const type = String(mediaType || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  const url = String(playableUrl || "").trim();

  if (type === "audio") return Boolean(url);
  if (mime.startsWith("audio/")) return Boolean(url);
  if (isEducationalProgressiveMediaUrl(url)) return true;
  // Progressive lecture MP4 often arrives as mediaType=video + mime video/mp4.
  if ((type === "video" || mime === "video/mp4" || mime.startsWith("video/")) && isEducationalProgressiveMediaUrl(url)) {
    return true;
  }
  return false;
}

/** Lectures must never open /tv-player. Progressive media uses shared audio. */
export function shouldRouteLectureToTvPlayer(
  mediaType: string,
  playableUrl: string,
  mimeType?: string | null
) {
  void mediaType;
  void playableUrl;
  void mimeType;
  return false;
}

export function isEducationalVideoPlayback(mediaType: string, playableUrl: string) {
  if (isEducationalProgressiveMediaUrl(playableUrl)) return false;
  if (String(mediaType || "").toLowerCase() === "video") return true;
  return playableUrl.includes("youtube") || /\.m3u8(?:\?|$)/i.test(playableUrl);
}

export function educationalSessionToAppSong(
  program: EducationalProgram,
  session: EducationalSessionPlayItem
): AppSong {
  const artist = program.educatorName || program.institutionName || "Hidden Tunes Lectures";
  const artwork = session.artworkUrl || program.artworkUrl || "";

  return {
    id: educationalSessionSongId(session.id),
    title: session.title,
    artist,
    album: program.title,
    user: { name: artist },
    channelTitle: program.title,
    artworkUrl: artwork,
    coverUrl: artwork,
    thumbnail: artwork,
    artwork,
    streamUrl: session.playableUrl,
    url: session.playableUrl,
    audioUrl: session.playableUrl,
    duration: session.durationSeconds || undefined,
    genre: program.primarySubjectSlug || "Lectures",
    mood: program.difficultyLevel || "Learning",
    source: "hidden-tunes",
    sourceName: "Lectures",
    type: "r2",
    isOnline: true,
  };
}

export function buildEducationalSessionAppSongs(
  program: EducationalProgram,
  sessions: EducationalSessionPlayItem[]
) {
  return sessions
    .filter(
      (session) =>
        session.mediaType === "audio" &&
        Boolean(session.playableUrl?.trim()) &&
        isEducationalAudioPlayback(session.mediaType, session.playableUrl)
    )
    .map((session) => educationalSessionToAppSong(program, session));
}

export function educationalSessionToMetadataAppSong(
  program: EducationalProgram,
  session: Pick<EducationalProgram, "title" | "educatorName" | "institutionName" | "artworkUrl" | "primarySubjectSlug" | "difficultyLevel"> & {
    id: string;
    title: string;
    artworkUrl?: string | null;
    durationSeconds?: number | null;
  }
): AppSong {
  const artist = program.educatorName || program.institutionName || "Hidden Tunes Lectures";
  const artwork = session.artworkUrl || program.artworkUrl || "";

  return {
    id: educationalSessionSongId(session.id),
    title: session.title,
    artist,
    album: program.title,
    user: { name: artist },
    channelTitle: program.title,
    artworkUrl: artwork,
    coverUrl: artwork,
    thumbnail: artwork,
    artwork,
    streamUrl: "",
    url: "",
    audioUrl: "",
    duration: session.durationSeconds || undefined,
    genre: program.primarySubjectSlug || "Lectures",
    mood: program.difficultyLevel || "Learning",
    source: "hidden-tunes",
    sourceName: "Lectures",
    type: "r2",
    isOnline: true,
  };
}

export type EducationalQueueContext = PlaybackQueueContext & {
  queueType?: typeof EDUCATIONAL_QUEUE_TYPE;
  contextType?: typeof EDUCATIONAL_PROGRAM_CONTEXT_TYPE;
  contextId?: string;
  contextTitle?: string;
};

export function buildEducationalQueueContext(program: EducationalProgram): EducationalQueueContext {
  return {
    source: "playlist",
    label: program.title || "Lectures & Learning",
    albumId: program.id,
    albumTitle: program.title,
    artistName: program.educatorName || program.institutionName || program.title,
    contextType: EDUCATIONAL_PROGRAM_CONTEXT_TYPE,
    contextId: program.id,
    contextTitle: program.title,
    queueType: EDUCATIONAL_QUEUE_TYPE,
  } as EducationalQueueContext;
}

export function isEducationalQueueContext(
  context?: PlaybackQueueContext | EducationalQueueContext | null
): context is EducationalQueueContext {
  if (!context) return false;
  const educationalContext = context as EducationalQueueContext;
  return (
    educationalContext.queueType === EDUCATIONAL_QUEUE_TYPE ||
    educationalContext.contextType === EDUCATIONAL_PROGRAM_CONTEXT_TYPE
  );
}

export function buildEducationalSessionQueueSongs(
  program: EducationalProgram,
  sessions: Array<{
    id: string;
    title: string;
    artworkUrl?: string | null;
    durationSeconds?: number | null;
  }>,
  activeSessionId: string,
  activeSong?: AppSong | null
) {
  return sessions.map((session) => {
    if (session.id === activeSessionId && activeSong) return activeSong;
    return educationalSessionToMetadataAppSong(program, session);
  });
}

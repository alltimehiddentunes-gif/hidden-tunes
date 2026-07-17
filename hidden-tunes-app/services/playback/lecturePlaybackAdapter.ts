import type { AppSong } from "../../context/PlayerContext";

export type LecturePlayableItem = {
  lectureId: string;
  itemId: string;
  title: string;
  speakerName?: string | null;
  seriesTitle?: string | null;
  artworkUrl?: string | null;
  durationSeconds?: number | null;
  mediaType: "audio" | "video";
  playbackUrl: string;
};

export const LECTURE_SONG_ID_PREFIX = "lecture:";

export function buildLectureCanonicalId(lectureId: string, itemId: string) {
  return `${LECTURE_SONG_ID_PREFIX}${lectureId}:item:${itemId}`;
}

export function parseLectureCanonicalId(
  songId: string
): { lectureId: string; itemId: string } | null {
  const raw = String(songId || "").trim();
  if (!raw.startsWith(LECTURE_SONG_ID_PREFIX)) return null;

  const payload = raw.slice(LECTURE_SONG_ID_PREFIX.length);
  const marker = ":item:";
  const markerIndex = payload.indexOf(marker);
  if (markerIndex <= 0) return null;

  const lectureId = payload.slice(0, markerIndex).trim();
  const itemId = payload.slice(markerIndex + marker.length).trim();
  if (!lectureId || !itemId) return null;
  return { lectureId, itemId };
}

export function isLectureQueueSong(song?: AppSong | null) {
  if (!song) return false;
  if (song.source === "lecture" || song.type === "lecture") return true;
  return String(song.id || "").startsWith("lecture");
}

export function isLectureVideoItem(item: Pick<LecturePlayableItem, "mediaType" | "playbackUrl">) {
  if (item.mediaType === "video") return true;
  return /\.mp4(?:\?|$)/i.test(item.playbackUrl);
}

export function lectureItemToAppSong(item: LecturePlayableItem): AppSong {
  const playbackUrl = item.playbackUrl.trim();
  return {
    id: buildLectureCanonicalId(item.lectureId, item.itemId),
    title: item.title,
    artist: item.speakerName || item.seriesTitle || "Educator",
    album: item.seriesTitle || undefined,
    albumId: item.lectureId,
    audioUrl: playbackUrl,
    streamUrl: playbackUrl,
    url: playbackUrl,
    artworkUrl: item.artworkUrl || undefined,
    coverUrl: item.artworkUrl || undefined,
    thumbnail: item.artworkUrl || undefined,
    duration: item.durationSeconds ?? undefined,
    source: "lecture",
    sourceName: "Hidden Tunes Lectures",
    type: "lecture",
    isOnline: true,
  };
}

export function buildLectureSessionSongs(
  items: LecturePlayableItem[],
  selectedCanonicalId?: string | null
): { songs: AppSong[]; startIndex: number } {
  const songs = items
    .filter((item) => item.playbackUrl.trim().startsWith("http"))
    .map(lectureItemToAppSong);

  if (!songs.length) {
    return { songs: [], startIndex: 0 };
  }

  const startIndex = selectedCanonicalId
    ? Math.max(
        0,
        songs.findIndex((song) => song.id === selectedCanonicalId)
      )
    : 0;

  return { songs, startIndex };
}

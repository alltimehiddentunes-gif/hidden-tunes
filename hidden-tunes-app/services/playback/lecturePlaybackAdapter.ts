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

/**
 * Stable player id. Colons are avoided because PlayerContext sanitizes ids.
 * Canonical form for docs/tests: lecture:{lectureId}:item:{itemId}
 */
export function buildLectureCanonicalId(lectureId: string, itemId: string) {
  return `lecture-${lectureId}--${itemId}`;
}

export function toLectureCanonicalLabel(lectureId: string, itemId: string) {
  return `lecture:${lectureId}:item:${itemId}`;
}

export function parseLectureCanonicalId(
  songId: string
): { lectureId: string; itemId: string } | null {
  const raw = String(songId || "").trim();
  // Preferred runtime id: lecture-{uuid}--{uuid}
  const runtime = raw.match(/^lecture-(.+)--(.+)$/i);
  if (runtime?.[1] && runtime?.[2]) {
    return { lectureId: runtime[1], itemId: runtime[2] };
  }

  // Documented / sanitized label forms
  const labeled = raw.match(/^lecture[:\-]+(.+?)[:\-]+item[:\-]+(.+)$/i);
  if (labeled?.[1] && labeled?.[2]) {
    return { lectureId: labeled[1], itemId: labeled[2] };
  }

  return null;
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
    audio_url: playbackUrl,
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

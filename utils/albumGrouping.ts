export type MusicTrack = {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  year?: string | number;
  thumbnail?: string;
  image?: string;
  url?: string;
  streamUrl?: string;
  sourceName?: string;
  type?: string;
  isOnline?: boolean;
};

export type AlbumGroup = {
  id: string;
  title: string;
  artist: string;
  year?: string;
  cover?: string;
  tracks: MusicTrack[];
};

const cleanText = (value?: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/official|audio|video|lyrics|visualizer|music video/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const guessAlbumName = (track: MusicTrack) => {
  if (track.album) return track.album;

  const title = cleanText(track.title);

  if (title.includes("album")) return "Album Tracks";
  if (title.includes("ep")) return "EP Tracks";
  if (title.includes("single")) return "Singles";

  return "Singles";
};

export function groupTracksIntoAlbums(
  tracks: MusicTrack[],
  fallbackArtist = "Unknown Artist"
): AlbumGroup[] {
  const map = new Map<string, AlbumGroup>();

  for (const track of tracks) {
    const artist = track.artist || fallbackArtist;
    const albumTitle = guessAlbumName(track);
    const key = `${artist}-${albumTitle}`.toLowerCase();

    if (!map.has(key)) {
      map.set(key, {
        id: key.replace(/[^a-z0-9]+/g, "-"),
        title: albumTitle,
        artist,
        year: track.year ? String(track.year) : undefined,
        cover: track.thumbnail || track.image,
        tracks: [],
      });
    }

    map.get(key)!.tracks.push(track);
  }

  return Array.from(map.values()).sort(
    (a, b) => b.tracks.length - a.tracks.length
  );
}
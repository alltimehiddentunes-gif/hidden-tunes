export interface HiddenTunesSong {
  id: string;
  title: string;
  artist: string;
  cover: string;
  streamUrl: string;
  lyrics?: string;
  isOnline: boolean;
}

const SONGS_URL = "https://hiddentunes.com/songs.json";

export async function fetchHiddenTunesSongs(): Promise<HiddenTunesSong[]> {
  try {
    const response = await fetch(SONGS_URL);

    if (!response.ok) {
      console.log("Failed to fetch songs:", response.status);
      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      console.log("songs.json is not an array");
      return [];
    }

    return data.map((song: any, index: number) => ({
      id: song.id || `song-${index}`,
      title: song.title || "Untitled Song",
      artist: song.artist || "Unknown Artist",
      cover:
        song.cover ||
        "https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=1200",
      streamUrl: song.streamUrl || "",
      lyrics: song.lyrics || "",
      isOnline: true,
    }));
  } catch (error) {
    console.log("Hidden Tunes songs fetch error:", error);
    return [];
  }
}
export type JamendoTrack = {
  id: string;
  title: string;
  artist: string;
  cover: string;
  streamUrl: string;
  sourceName: "Jamendo";
  isOnline: true;
};

const JAMENDO_CLIENT_ID = "56d84245";

export async function searchJamendoMusic(query: string): Promise<JamendoTrack[]> {
  if (!query.trim()) return [];

  try {
    const params = new URLSearchParams({
      client_id: JAMENDO_CLIENT_ID,
      format: "json",
      limit: "20",
      search: query,
      include: "musicinfo",
      audioformat: "mp32",
    });

    const response = await fetch(
      `https://api.jamendo.com/v3.0/tracks/?${params.toString()}`
    );

    const json = await response.json();
    const results = json?.results || [];

    return results
      .filter((item: any) => item.audio)
      .map((item: any) => ({
        id: `jamendo-${item.id}`,
        title: item.name || "Untitled",
        artist: item.artist_name || "Jamendo Artist",
        cover:
          item.album_image ||
          item.image ||
          "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000",
        streamUrl: item.audio,
        sourceName: "Jamendo",
        isOnline: true,
      }));
  } catch (error) {
    console.log("Jamendo search error:", error);
    return [];
  }
}
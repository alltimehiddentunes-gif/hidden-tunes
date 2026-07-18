import type { AppSong } from "../../context/PlayerContext";
import type { RadioStation } from "../../types/radio";

export function radioStationToAppSong(station: RadioStation): AppSong {
  const subtitle = [station.country, station.genre, ...(station.tags || []).slice(0, 2)]
    .filter(Boolean)
    .join(" · ");

  return {
    id: `radio-${station.id}`,
    title: station.title,
    artist: subtitle || "Hidden Tunes Radio",
    streamUrl: station.streamUrl,
    url: station.streamUrl,
    artworkUrl: station.artworkUrl,
    coverUrl: station.artworkUrl,
    thumbnail: station.artworkUrl,
    genre: station.genre,
    source: "radio",
    sourceName: "Hidden Tunes",
    type: "live_stream",
    isOnline: true,
  };
}

export function isRadioStreamSong(song?: AppSong | null) {
  if (!song) return false;
  if (song.type === "live_stream") return true;
  return String(song.id || "").startsWith("radio-");
}

/** Stable song id for a radio station uuid / id. */
export function radioStationSongId(stationId: string) {
  const id = String(stationId || "").trim();
  if (!id) return "";
  return id.startsWith("radio-") ? id : `radio-${id}`;
}

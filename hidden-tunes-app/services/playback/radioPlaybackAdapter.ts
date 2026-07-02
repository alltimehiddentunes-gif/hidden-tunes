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

export { isRadioStreamSong } from "../../utils/playbackSongIdentity";

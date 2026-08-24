import type { LabSong } from "./types";

/** Laboratory reproduction of the current Desktop continuation hierarchy. */
export function rankCurrentBaseline(seed: LabSong, candidates: LabSong[], limit = 10): LabSong[] {
  const seen = new Set<string>();
  return candidates.filter((song) => {
    if (song.id === seed.id || seen.has(song.id) || !song.playable || !song.published) return false;
    seen.add(song.id); return song.maturity === "safe";
  }).map((song, index) => {
    const sameAlbum = song.albumId === seed.albumId;
    const sameArtist = song.artistId === seed.artistId;
    const sameGenre = song.genre.toLowerCase() === seed.genre.toLowerCase();
    const sameMood = Boolean(seed.mood && song.mood?.toLowerCase().includes(seed.mood.toLowerCase()));
    const score = (sameAlbum ? 95_000 : sameArtist ? 75_000 : sameGenre ? 55_000 : sameMood ? 48_000 : 50) + Math.max(0, 500 - index);
    return { song, score };
  }).sort((a, b) => b.score - a.score).slice(0, limit).map(({ song }) => song);
}

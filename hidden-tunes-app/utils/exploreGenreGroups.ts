import { getArtworkUri } from "./artwork";
import { getSongDedupeKey } from "./catalogDedupe";
import { getVisibleCoreGenres } from "./genreAliases";
import {
  getSongNormalizedGenres,
  normalizeGenreName,
  songHasNormalizedGenre,
} from "./genreNormalization";

export type GenreSpotlightGroup<T> = {
  id: string;
  title: string;
  subtitle: string;
  genreTitle: string;
  songs: T[];
  artwork: string[];
  artworkSong?: T;
  preview: string[];
  score: number;
};

function artworkForSong(song: { artwork?: string; cover?: string; thumbnail?: string }) {
  return getArtworkUri(song, "");
}

function previewForSong(song: { artist?: string; title?: string }) {
  const artist = String(song.artist || "Hidden Tunes").trim();
  const title = String(song.title || "Song").trim();
  return `${artist} - ${title}`;
}

/**
 * Genre spotlight groups: songs and artwork must belong to the same normalized genre.
 */
type GenreGroupSong = {
  id?: string;
  title?: string;
  artist?: string;
  genre?: unknown;
  genres?: unknown;
  primaryGenre?: unknown;
  primary_genre?: unknown;
  moodGenre?: unknown;
  artwork?: string;
  cover?: string;
  thumbnail?: string;
};

export function buildGenreSpotlightGroups<T extends GenreGroupSong>(
  songs: T[],
  limit = 6
): GenreSpotlightGroup<T>[] {
  const pool = songs.filter((song) => getSongNormalizedGenres(song).length > 0);
  const usedArtworkKeys = new Set<string>();

  const groups = getVisibleCoreGenres()
    .map((core) => {
      const title = normalizeGenreName(core.title);
      const groupSongs = pool.filter((song) => songHasNormalizedGenre(song, title));
      if (!groupSongs.length) return null;

      let artworkSong: T | undefined;
      let artworkUrl = "";

      for (const song of groupSongs) {
        const url = artworkForSong(song);
        if (!url) continue;

        const key = getSongDedupeKey(song);
        if (usedArtworkKeys.has(key)) continue;

        artworkSong = song;
        artworkUrl = url;
        usedArtworkKeys.add(key);
        break;
      }

      if (!artworkUrl) {
        for (const song of groupSongs) {
          const url = artworkForSong(song);
          if (!url) continue;
          artworkSong = song;
          artworkUrl = url;
          break;
        }
      }

      return {
        id: `genre-${title}`,
        title,
        subtitle: `${groupSongs.length} ${
          groupSongs.length === 1 ? "song" : "songs"
        } in this room`,
        genreTitle: title,
        songs: groupSongs.slice(0, 10),
        artwork: artworkUrl ? [artworkUrl] : [],
        artworkSong,
        preview: groupSongs.slice(0, 3).map(previewForSong),
        score: groupSongs.length,
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);

  return groups.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function logExploreGenreGroups<T extends { title?: string }>(
  groups: GenreSpotlightGroup<T>[]
) {
  console.log(
    "[explore] genre groups",
    groups.map((group) => ({
      genre: group.title,
      count: group.songs.length,
      artworkSource: group.artworkSong?.title,
    }))
  );
}

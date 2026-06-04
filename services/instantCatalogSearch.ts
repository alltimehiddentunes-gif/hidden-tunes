import type { HiddenTunesGenre } from "../utils/genres";
import type {
  HiddenTunesAlbum,
  HiddenTunesArtist,
  HiddenTunesNormalizedSong,
} from "./hiddenTunesApi";
import type { HiddenTunesTvVideo } from "./tvCatalogApi";
import type { HiddenTunesCatalogPlaylist } from "./hiddenTunes";
import {
  EMPTY_UNIVERSAL_SEARCH_RESULTS,
  runUniversalCatalogSearch,
  type UniversalSearchGroupedResults,
} from "./universalSearchService";

export type InstantSearchCatalog = {
  songs: HiddenTunesNormalizedSong[];
  albums: HiddenTunesAlbum[];
  artists: HiddenTunesArtist[];
  genres: HiddenTunesGenre[];
  playlists?: HiddenTunesCatalogPlaylist[];
  tvVideos: HiddenTunesTvVideo[];
};

export function runInstantCatalogSearch(
  catalog: InstantSearchCatalog,
  query: string
): UniversalSearchGroupedResults {
  return runUniversalCatalogSearch(
    {
      songs: catalog.songs,
      albums: catalog.albums,
      artists: catalog.artists,
      genres: catalog.genres,
      playlists: catalog.playlists,
      tvVideos: catalog.tvVideos,
    },
    query
  );
}

export function invalidateCatalogSearchIndex() {
  // Index invalidation retained for callers; universal search builds per query.
}

export { EMPTY_UNIVERSAL_SEARCH_RESULTS as EMPTY_INSTANT_SEARCH_RESULTS };

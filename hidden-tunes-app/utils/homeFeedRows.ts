import type { HiddenTunesNormalizedSong } from "../services/hiddenTunesApi";
import type { SmartDiscoverySection } from "../services/smartDiscovery";

type MoodRoom = {
  id: string;
  title: string;
  subtitle: string;
  songs: HiddenTunesNormalizedSong[];
  artwork?: string[];
};

type GenreSpotlight = {
  id: string;
  title: string;
  subtitle: string;
  songs: HiddenTunesNormalizedSong[];
};

export type HomeFeedRow =
  | { key: string; kind: "tv-section" }
  | { key: string; kind: "section-title"; title: string }
  | { key: string; kind: "song"; song: HiddenTunesNormalizedSong; sectionId: string }
  | { key: string; kind: "artists-rail" }
  | { key: string; kind: "albums-rail" }
  | { key: string; kind: "recently-added" }
  | { key: string; kind: "curated-section"; section: SmartDiscoverySection<HiddenTunesNormalizedSong> }
  | { key: string; kind: "mood-rooms-header" }
  | { key: string; kind: "mood-rooms-rail" }
  | { key: string; kind: "genre-spotlight-header" }
  | { key: string; kind: "catalog-header" }
  | { key: string; kind: "show-more" }
  | { key: string; kind: "footer-spacer" };

export type BuildHomeFeedRowsInput = {
  deferredSectionsReady: boolean;
  becauseYouListened: HiddenTunesNormalizedSong[];
  moreLikeThisMoodSongs: HiddenTunesNormalizedSong[];
  rankedArtistsCount: number;
  rankedAlbumsCount: number;
  curatedSections: SmartDiscoverySection<HiddenTunesNormalizedSong>[];
  moodRooms: MoodRoom[];
  activeMoodRoom: MoodRoom | undefined;
  primaryGenreSpotlight: GenreSpotlight | undefined;
  visibleAllSongs: HiddenTunesNormalizedSong[];
  featuredSongsCount: number;
  showMoreButton: boolean;
};

export function buildHomeFeedRows(input: BuildHomeFeedRowsInput): HomeFeedRow[] {
  if (!input.deferredSectionsReady) {
    return [];
  }

  const rows: HomeFeedRow[] = [];

  rows.push({ key: "tv-section", kind: "tv-section" });

  if (input.becauseYouListened.length > 0) {
    rows.push({ key: "title-because-you-listened", kind: "section-title", title: "Because You Listened" });
    for (const song of input.becauseYouListened) {
      rows.push({
        key: `song-because-you-listened-${String(song.id || song.title || song.streamUrl)}`,
        kind: "song",
        song,
        sectionId: "because-you-listened",
      });
    }
  }

  if (input.moreLikeThisMoodSongs.length > 0) {
    rows.push({ key: "title-more-like-this-mood", kind: "section-title", title: "More Like This Mood" });
    for (const song of input.moreLikeThisMoodSongs) {
      rows.push({
        key: `song-more-like-this-mood-${String(song.id || song.title || song.streamUrl)}`,
        kind: "song",
        song,
        sectionId: "more-like-this-mood",
      });
    }
  }

  if (input.rankedArtistsCount > 0) {
    rows.push({ key: "title-creators", kind: "section-title", title: "Creators In Your Orbit" });
    rows.push({ key: "rail-artists", kind: "artists-rail" });
  }

  if (input.rankedAlbumsCount > 0) {
    rows.push({ key: "title-albums", kind: "section-title", title: "Albums Worth Staying With" });
    rows.push({ key: "rail-albums", kind: "albums-rail" });
  }

  rows.push({ key: "recently-added", kind: "recently-added" });

  for (const section of input.curatedSections) {
    if (!section.songs?.length) continue;

    rows.push({
      key: `curated-${section.id}`,
      kind: "curated-section",
      section,
    });
  }

  if (input.moodRooms.length > 0) {
    rows.push({ key: "mood-rooms-header", kind: "mood-rooms-header" });
    rows.push({ key: "mood-rooms-rail", kind: "mood-rooms-rail" });

    const moodSongs = input.activeMoodRoom?.songs.slice(0, 4) || [];
    for (const song of moodSongs) {
      rows.push({
        key: `song-mood-rooms-${String(song.id || song.title || song.streamUrl)}`,
        kind: "song",
        song,
        sectionId: "mood-rooms",
      });
    }
  }

  if (input.primaryGenreSpotlight?.songs?.length) {
    rows.push({ key: "genre-spotlight-header", kind: "genre-spotlight-header" });
    for (const song of input.primaryGenreSpotlight.songs.slice(0, 4)) {
      rows.push({
        key: `song-genre-spotlights-${String(song.id || song.title || song.streamUrl)}`,
        kind: "song",
        song,
        sectionId: "genre-spotlights",
      });
    }
  }

  if (input.visibleAllSongs.length > 0 || input.featuredSongsCount > 0) {
    rows.push({ key: "catalog-header", kind: "catalog-header" });
  }

  for (const song of input.visibleAllSongs) {
    rows.push({
      key: `catalog-${String(song.id || song.title || song.streamUrl)}`,
      kind: "song",
      song,
      sectionId: "full-catalog",
    });
  }

  if (input.showMoreButton) {
    rows.push({ key: "show-more", kind: "show-more" });
  }

  rows.push({ key: "footer-spacer", kind: "footer-spacer" });

  return rows;
}

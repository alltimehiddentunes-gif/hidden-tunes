import type { HiddenTunesNormalizedSong } from "../services/hiddenTunesApi";
import type { SmartDiscoverySection } from "../services/smartDiscovery";
import {
  getSongDedupeKey,
  logCatalogDedupeSummary,
} from "./catalogDedupe";

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

export type HomeFeedMountStage = 0 | 1 | 2 | 3;

export type BuildHomeFeedRowsInput = {
  feedMountStage: HomeFeedMountStage;
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
  if (input.feedMountStage < 1) {
    return [];
  }

  const rows: HomeFeedRow[] = [];
  const usedSongKeys = new Set<string>();

  const appendUniqueSongRows = (
    sectionId: string,
    songs: HiddenTunesNormalizedSong[]
  ) => {
    const before = songs.length;
    const unique: HiddenTunesNormalizedSong[] = [];

    songs.forEach((song) => {
      const key = getSongDedupeKey(song);
      if (!key || usedSongKeys.has(key)) return;
      usedSongKeys.add(key);
      unique.push(song);
    });

    logCatalogDedupeSummary(sectionId, before, unique.length);

    unique.forEach((song) => {
      rows.push({
        key: `song-${sectionId}-${String(song.id || song.title || song.streamUrl)}`,
        kind: "song",
        song,
        sectionId,
      });
    });

    return unique.length;
  };

  const pushUniqueSongRows = (
    sectionId: string,
    title: string,
    songs: HiddenTunesNormalizedSong[],
    titleKey: string
  ) => {
    if (!songs.length) return;

    rows.push({ key: titleKey, kind: "section-title", title });
    appendUniqueSongRows(sectionId, songs);
  };

  rows.push({ key: "recently-added", kind: "recently-added" });

  if (input.becauseYouListened.length > 0) {
    pushUniqueSongRows(
      "because-you-listened",
      "Because You Listened",
      input.becauseYouListened,
      "title-because-you-listened"
    );
  }

  if (input.moreLikeThisMoodSongs.length > 0) {
    pushUniqueSongRows(
      "more-like-this-mood",
      "More Like This Mood",
      input.moreLikeThisMoodSongs,
      "title-more-like-this-mood"
    );
  }

  if (input.feedMountStage >= 2) {
    if (input.rankedArtistsCount > 0) {
      rows.push({ key: "title-creators", kind: "section-title", title: "Creators In Your Orbit" });
      rows.push({ key: "rail-artists", kind: "artists-rail" });
    }

    if (input.rankedAlbumsCount > 0) {
      rows.push({ key: "title-albums", kind: "section-title", title: "Albums Worth Staying With" });
      rows.push({ key: "rail-albums", kind: "albums-rail" });
    }
  }

  if (input.feedMountStage >= 3) {
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

      appendUniqueSongRows(
        "mood-rooms",
        input.activeMoodRoom?.songs.slice(0, 4) || []
      );
    }

    if (input.primaryGenreSpotlight?.songs?.length) {
      rows.push({ key: "genre-spotlight-header", kind: "genre-spotlight-header" });
      appendUniqueSongRows(
        "genre-spotlights",
        input.primaryGenreSpotlight.songs.slice(0, 4)
      );
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
  }

  return rows;
}

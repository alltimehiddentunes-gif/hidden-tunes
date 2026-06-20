import type { HiddenTunesNormalizedSong } from "../services/hiddenTunesApi";
import type { LaunchContentSnapshot } from "../services/launchContentLayer";
import type { SmartRadioEntry } from "../services/smartRecommendations";
import type { LaunchContentChip } from "./launchContentRegistry";
import { LAUNCH_CONTENT_LABELS } from "./launchContentRegistry";
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
  gradient?: readonly [string, string, ...string[]];
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
  | { key: string; kind: "emotional-worlds-chips" }
  | { key: string; kind: "launch-playlists-rail"; title: string; playlists: LaunchContentSnapshot["featuredPlaylists"] }
  | { key: string; kind: "launch-chips"; title: string; chips: LaunchContentChip[] }
  | { key: string; kind: "launch-featured-radios"; entries: SmartRadioEntry[] }
  | { key: string; kind: "genre-spotlight-header" }
  | { key: string; kind: "catalog-header" }
  | { key: string; kind: "show-more" }
  | { key: string; kind: "footer-spacer" };

export type HomeFeedMountStage = 0 | 1 | 2 | 3;

export type BuildHomeFeedRowsInput = {
  feedMountStage: HomeFeedMountStage;
  recommendedForYou: HiddenTunesNormalizedSong[];
  becauseYouPlayed: HiddenTunesNormalizedSong[];
  continueListening: HiddenTunesNormalizedSong[];
  rediscoverFavorites: HiddenTunesNormalizedSong[];
  moreLikeThisSongs: HiddenTunesNormalizedSong[];
  moreLikeThisMoodSongs: HiddenTunesNormalizedSong[];
  launchContent: LaunchContentSnapshot;
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
  const launch = input.launchContent;

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

  const pushLaunchChips = (
    key: string,
    title: string,
    chips: LaunchContentChip[]
  ) => {
    if (!chips.length) return;
    rows.push({ key, kind: "launch-chips", title, chips });
  };

  rows.push({ key: "recently-added", kind: "recently-added" });

  pushUniqueSongRows(
    "recommended-for-you",
    "Recommended For You",
    input.recommendedForYou,
    "title-recommended-for-you"
  );

  if (input.becauseYouPlayed.length > 0) {
    pushUniqueSongRows(
      "because-you-played",
      "Because You Played",
      input.becauseYouPlayed,
      "title-because-you-played"
    );
  }

  pushUniqueSongRows(
    "continue-listening",
    "Continue Listening",
    input.continueListening,
    "title-continue-listening"
  );

  pushUniqueSongRows(
    "rediscover-favorites",
    "Rediscover Favorites",
    input.rediscoverFavorites,
    "title-rediscover-favorites"
  );

  pushUniqueSongRows(
    "more-like-this",
    "More Like This",
    input.moreLikeThisSongs,
    "title-more-like-this"
  );

  if (input.moreLikeThisMoodSongs.length > 0) {
    pushUniqueSongRows(
      "more-like-this-mood",
      "More Like This Mood",
      input.moreLikeThisMoodSongs,
      "title-more-like-this-mood"
    );
  }

  if (input.feedMountStage >= 2) {
    pushUniqueSongRows(
      "trending-now",
      LAUNCH_CONTENT_LABELS.trendingNow,
      launch.trendingNow,
      "title-trending-now"
    );

    pushUniqueSongRows(
      "new-releases",
      LAUNCH_CONTENT_LABELS.newReleases,
      launch.newReleases,
      "title-new-releases"
    );

    pushUniqueSongRows(
      "hidden-picks",
      LAUNCH_CONTENT_LABELS.hiddenPicks,
      launch.hiddenPicks,
      "title-hidden-picks"
    );

    if (launch.featuredPlaylists.length > 0) {
      rows.push({
        key: "launch-featured-playlists",
        kind: "launch-playlists-rail",
        title: LAUNCH_CONTENT_LABELS.featuredPlaylists,
        playlists: launch.featuredPlaylists,
      });
    }

    pushLaunchChips(
      "launch-featured-worlds",
      LAUNCH_CONTENT_LABELS.featuredWorlds,
      launch.featuredWorlds
    );

    pushLaunchChips(
      "launch-featured-genres",
      LAUNCH_CONTENT_LABELS.featuredGenres,
      launch.featuredGenres
    );

    if (launch.featuredRadios.length > 0) {
      rows.push({
        key: "launch-featured-radios",
        kind: "launch-featured-radios",
        entries: launch.featuredRadios,
      });
    }

    pushLaunchChips(
      "launch-featured-videos",
      LAUNCH_CONTENT_LABELS.featuredVideos,
      launch.featuredVideos
    );

    pushLaunchChips(
      "launch-featured-podcasts",
      LAUNCH_CONTENT_LABELS.featuredPodcasts,
      launch.featuredPodcasts
    );

    pushLaunchChips(
      "launch-continue-exploring",
      LAUNCH_CONTENT_LABELS.continueExploring,
      launch.continueExploring
    );

    if (launch.featuredWorlds.length === 0) {
      rows.push({ key: "emotional-worlds-chips", kind: "emotional-worlds-chips" });
    }

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

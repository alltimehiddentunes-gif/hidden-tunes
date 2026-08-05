import type {
  AndroidAutoBrowseItem,
  AndroidAutoCatalogSnapshot,
  AndroidAutoTrackPayload,
} from "./androidAutoCatalogSync";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PodcastEpisode, PodcastShow } from "../types/podcast";
import type { AudiobookChapterPlayItem, AudiobookItem } from "../types/audiobooks";
import type { HiddenTunesStation } from "../types/radio";
import { getFavorites } from "./favorites/unifiedFavorites";
import { getFollowedPodcastShows, getSavedPodcastEpisodes } from "./podcastLibrary";
import {
  loadMaturePodcastRecentlyPlayed,
  loadPodcastRecentlyPlayed,
} from "./podcastRecentlyPlayed";
import {
  fetchPodcastEpisodesByShow,
  fetchPodcastEpisodePlay,
} from "./podcastCatalogApi";
import { listAudiobookProgress } from "./audiobookProgress";
import { fetchAudiobookChapterQueuePlay } from "./audiobooksApi";
import { loadRecentlyPlayedRadioItems } from "./radio/recentlyPlayedRadio";
import {
  hydrateCachedRadioStations,
  readCachedRadioStations,
} from "./radio/radioCache";
import { isPlayableLiveRadioStreamUrl } from "./radio/radioPlaybackSession";
import {
  audiobookChapterSongId,
  isPlayableAudiobookChapterAudioUrl,
} from "../utils/audiobookPlaybackAdapter";
import {
  isPlayablePodcastAudioUrl,
  podcastEpisodeSongId,
} from "../utils/podcastPlaybackAdapter";
import {
  isCarPlayContentVisible,
  isCarPlayMatureContent,
} from "./carPlayCatalogSnapshot";
import type { CarPlayPreferenceSnapshot } from "./carPlayPersonalization";

const CAPS = {
  podcastShows: 8,
  episodesPerShow: 12,
  podcastRecent: 8,
  podcastSaved: 8,
  audiobookBooks: 4,
  chaptersPerBook: 12,
  radioGroup: 8,
} as const;
const COMPACT_PLAYBACK_SESSION_KEY = "hidden_tunes_compact_playback_session_v1";

type ExtendedTrack = AndroidAutoTrackPayload & Record<string, unknown>;
let cachedAudiobookCatalog: {
  tracks: ExtendedTrack[];
  sections: AndroidAutoCatalogSnapshot["sections"];
  continueNodes: AndroidAutoBrowseItem[];
} | null = null;
let cachedPodcastEnrichment: PodcastEpisode[] = [];

function clean(value: unknown) {
  return String(value || "").trim();
}

function empty(parentId: string, title: string): AndroidAutoBrowseItem {
  return { mediaId: `empty:${parentId}`, title, subtitle: "", playable: false };
}

function uniqueById<T>(values: T[], id: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = clean(id(value));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function podcastTrack(episode: PodcastEpisode): ExtendedTrack | null {
  const id = clean(episode.id);
  const showId = clean(episode.showId);
  const url = clean(episode.audioUrl);
  if (!id || !showId || !clean(episode.title) || !isPlayablePodcastAudioUrl(url)) return null;
  if (!isCarPlayContentVisible(episode)) return null;
  return {
    mediaId: `podcast:${id}`,
    id: podcastEpisodeSongId(id),
    url,
    title: clean(episode.title),
    artist: clean(episode.showTitle) || "Podcast",
    album: clean(episode.showTitle),
    artworkUrl: clean(episode.artworkUrl),
    durationSeconds: Math.max(0, Number(episode.durationSeconds) || 0),
    contentType: "podcast",
    isLive: false,
    isMature: isCarPlayMatureContent(episode),
    showId,
    episodeId: id,
    publishedAt: clean(episode.publishedAt),
    collection: episode.categories.join(" · "),
  };
}

function audiobookTrack(
  book: AudiobookItem,
  chapter: AudiobookChapterPlayItem,
  resumePositionMillis = 0
): ExtendedTrack | null {
  const id = clean(chapter.id);
  const url = clean(chapter.audio_url);
  if (!id || !clean(book.id) || !clean(chapter.title)
    || !isPlayableAudiobookChapterAudioUrl(url)) return null;
  if (!isCarPlayContentVisible(book)) return null;
  return {
    mediaId: `audiobook:${id}`,
    id: audiobookChapterSongId(id),
    url,
    title: clean(chapter.title),
    artist: clean(book.author_name || book.narrator_name || book.publisher) || "Audiobook",
    album: clean(book.title),
    artworkUrl: clean(book.cover_url),
    durationSeconds: Math.max(0, Number(chapter.duration_seconds || chapter.file?.duration_seconds) || 0),
    contentType: "audiobook",
    isLive: false,
    isMature: isCarPlayMatureContent(book),
    bookId: clean(book.id),
    chapterId: id,
    chapterNumber: Number(chapter.chapter_number) || 0,
    resumePositionMillis: Math.max(0, Number(resumePositionMillis) || 0),
    collection: clean(book.category_slug || book.categories.join(" · ")),
  };
}

function stationTrack(station: HiddenTunesStation): ExtendedTrack | null {
  const id = clean(station.id);
  const url = clean(station.streamUrl);
  const raw = station as HiddenTunesStation & Record<string, unknown>;
  const status = clean(raw.status).toLowerCase();
  const hasClassification = typeof station.is_mature === "boolean"
    || clean(station.content_rating) === "clean"
    || clean(station.content_rating) === "explicit"
    || clean(station.content_rating) === "adult";
  if (!id || !clean(station.name) || !isPlayableLiveRadioStreamUrl(url)
    || !hasClassification
    || raw.isPublic === false || raw.is_public === false || raw.public === false
    || raw.disabled === true || raw.quarantined === true || raw.is_quarantined === true
    || status === "quarantined" || !isCarPlayContentVisible(station)) return null;
  const tags = Array.isArray(station.tags) ? station.tags.map(clean).filter(Boolean) : [];
  return {
    mediaId: `radio:${id}`,
    id: `radio-${id}`,
    url,
    title: clean(station.name),
    artist: clean(station.country) || tags[0] || "Live Radio",
    album: "Radio",
    artworkUrl: clean(station.favicon),
    durationSeconds: 0,
    contentType: "radio",
    isLive: true,
    isLiveStream: true,
    isMature: isCarPlayMatureContent(station),
    stationId: id,
    country: clean(station.country),
    genre: tags[0] || "",
    collection: [clean(station.country), ...tags].filter(Boolean).join(" · "),
  };
}

function node(track: ExtendedTrack): AndroidAutoBrowseItem {
  return {
    mediaId: track.mediaId,
    title: track.title,
    subtitle: track.artist,
    playable: true,
    artworkUrl: track.artworkUrl,
    contentType: clean(track.contentType),
  };
}

function section(
  parentId: string,
  items: AndroidAutoBrowseItem[],
  emptyTitle: string
): AndroidAutoCatalogSnapshot["sections"][number] {
  return { parentId, items: items.length ? items : [empty(parentId, emptyTitle)] };
}

async function collectPodcasts(allowNetwork: boolean, preferences?: CarPlayPreferenceSnapshot) {
  const [recent, matureRecent, saved, followed] = await Promise.all([
    loadPodcastRecentlyPlayed(16),
    loadMaturePodcastRecentlyPlayed(16),
    getSavedPodcastEpisodes(),
    getFollowedPodcastShows(),
  ]);
  if (allowNetwork) {
    const existingShowIds = new Set([...recent, ...matureRecent, ...saved].map((item) => item.showId));
    const candidates = followed.filter((show) => show.matureLevel === "safe"
      && !existingShowIds.has(show.id)).slice(0, 4);
    const enriched = await Promise.all(candidates.map(async (show) => {
      try {
        const response = await fetchPodcastEpisodesByShow(show.id, 1, 4, { includeMature: false });
        const plays = await Promise.all(response.episodes.slice(0, 4).map(async (metadata) => {
          const resolved = await fetchPodcastEpisodePlay(metadata.id, { includeMature: false });
          if (!resolved.success || !resolved.play) return null;
          const episode: PodcastEpisode = {
            id: resolved.play.id,
            showId: show.id,
            showTitle: show.title,
            publisher: show.publisher,
            title: resolved.play.title || metadata.title,
            description: metadata.description || "",
            artworkUrl: metadata.artworkUrl || show.artworkUrl,
            audioUrl: resolved.play.audioUrl,
            durationSeconds: resolved.play.durationSeconds || metadata.durationSeconds,
            publishedAt: resolved.play.publishedAt || metadata.publishedAt,
            language: show.language,
            categories: show.categories,
            isExplicit: false,
            matureLevel: "safe" as const,
            source: "podcast_rss" as const,
          };
          return episode;
        }));
        return plays.filter((episode): episode is PodcastEpisode => episode !== null);
      } catch {
        return [] as PodcastEpisode[];
      }
    }));
    cachedPodcastEnrichment = uniqueById(enriched.flat(), (item) => item.id);
  }
  const episodes = uniqueById([
    ...recent, ...matureRecent, ...saved, ...cachedPodcastEnrichment,
  ], (item) => item.id)
    .filter(isCarPlayContentVisible);
  const podcastTokens = new Set(preferences?.podcastTokens || []);
  const shows = uniqueById([
    ...followed,
    ...episodes.map((episode): PodcastShow => ({
      id: episode.showId, title: episode.showTitle, publisher: episode.publisher || episode.showTitle,
      description: "", artworkUrl: episode.artworkUrl, feedUrl: "", language: episode.language,
      categories: episode.categories, isExplicit: episode.isExplicit,
      matureLevel: episode.matureLevel, source: "rss",
    })),
  ], (item) => item.id).filter(isCarPlayContentVisible).sort((a, b) => {
    const score = (show: PodcastShow) => (podcastTokens.has(clean(show.id).toLowerCase()) ? 20 : 0)
      + show.categories.filter((category) => podcastTokens.has(clean(category).toLowerCase())).length * 5;
    return score(b) - score(a);
  }).slice(0, CAPS.podcastShows);

  const tracks = episodes.map(podcastTrack).filter((item): item is ExtendedTrack => Boolean(item));
  const continueNodes: AndroidAutoBrowseItem[] = [];
  try {
    const rawSession = await AsyncStorage.getItem(COMPACT_PLAYBACK_SESSION_KEY);
    const session = rawSession ? JSON.parse(rawSession) as Record<string, unknown> : null;
    const currentSongId = clean(session?.currentSongId);
    const positionMillis = Math.max(0, Number(session?.positionMillis) || 0);
    const context = (session?.context || {}) as Record<string, unknown>;
    const isPodcast = clean(context.queueType) === "podcast"
      || clean(context.contextType) === "podcast-show"
      || currentSongId.startsWith("podcast-");
    const savedAt = Math.max(0, Number(session?.savedAt) || 0);
    if (isPodcast && positionMillis > 3000 && savedAt > Date.now() - 90 * 86_400_000) {
      const active = tracks.find((track) => track.id === currentSongId);
      const durationMillis = Math.max(0, Number(active?.durationSeconds) || 0) * 1000;
      if (active && (!durationMillis || positionMillis < durationMillis - 5000)) {
        active.resumePositionMillis = positionMillis;
        continueNodes.push(node(active));
      }
    }
  } catch {
    // Missing or malformed compact playback state produces no Continue row.
  }
  const byMediaId = new Map(tracks.map((track) => [track.mediaId, track]));
  const sections: AndroidAutoCatalogSnapshot["sections"] = [];
  const showNodes: AndroidAutoBrowseItem[] = [];
  for (const show of shows) {
    const parentId = `podcast-show:${clean(show.id)}`;
    const children = tracks.filter((track) => track.showId === show.id)
      .slice(0, CAPS.episodesPerShow).map(node);
    showNodes.push({ mediaId: parentId, title: clean(show.title),
      subtitle: clean(show.publisher), playable: false, artworkUrl: clean(show.artworkUrl),
      contentType: "podcast_show" });
    sections.push(section(parentId, children, "Episodes will appear here."));
  }
  const recentNodes = recent.map((episode) => byMediaId.get(`podcast:${episode.id}`))
    .filter((item): item is ExtendedTrack => Boolean(item)).slice(0, CAPS.podcastRecent).map(node);
  const savedNodes = saved.map((episode) => byMediaId.get(`podcast:${episode.id}`))
    .filter((item): item is ExtendedTrack => Boolean(item)).slice(0, CAPS.podcastSaved).map(node);
  sections.push(section("podcasts", [
    ...showNodes,
    { mediaId: "podcast_saved", title: "Saved Episodes", subtitle: "Episodes saved on your phone", playable: false },
    { mediaId: "podcast_recent", title: "Recently Played", subtitle: "Recent podcast listening", playable: false },
  ], "Your podcast shows will appear here."));
  sections.push(section("podcast_recent", recentNodes, "Your recent podcast listening will appear here."));
  sections.push(section("podcast_saved", savedNodes, "Saved episodes will appear here."));
  const recommendedShows = showNodes.filter((show) => sections.some((entry) =>
    entry.parentId === show.mediaId && entry.items.some((item) => item.playable))).slice(0, 8);
  sections.push(section("recommended_podcasts", recommendedShows,
    "Podcast recommendations will appear as you listen."));
  return { tracks, sections, recentNodes, continueNodes };
}

async function collectAudiobooks(allowNetwork: boolean) {
  if (!allowNetwork) {
    if (cachedAudiobookCatalog) return cachedAudiobookCatalog;
    return { tracks: [] as ExtendedTrack[], sections: [
      section("audiobooks", [], "Your audiobooks will appear here."),
    ], continueNodes: [] as AndroidAutoBrowseItem[] };
  }
  const progress = await listAudiobookProgress(CAPS.audiobookBooks);
  const tracks: ExtendedTrack[] = [];
  const sections: AndroidAutoCatalogSnapshot["sections"] = [];
  const bookNodes: AndroidAutoBrowseItem[] = [];
  const continueNodes: AndroidAutoBrowseItem[] = [];
  for (const entry of progress) {
    try {
      const response = await fetchAudiobookChapterQueuePlay(entry.bookId, entry.chapterId);
      if (!isCarPlayContentVisible(response.audiobook)) continue;
      const parentId = `audiobook-book:${response.audiobook.id}`;
      const bookTracks = response.chapters.slice(0, CAPS.chaptersPerBook)
        .map((chapter) => audiobookTrack(response.audiobook, chapter,
          chapter.id === entry.chapterId ? entry.positionMillis : 0))
        .filter((item): item is ExtendedTrack => Boolean(item));
      if (!bookTracks.length) continue;
      tracks.push(...bookTracks);
      bookNodes.push({ mediaId: parentId, title: response.audiobook.title,
        subtitle: clean(response.audiobook.author_name || response.audiobook.narrator_name),
        playable: false, artworkUrl: clean(response.audiobook.cover_url), contentType: "audiobook" });
      sections.push(section(parentId, bookTracks.map(node), "Chapters will appear here."));
      const active = bookTracks.find((track) => track.chapterId === entry.chapterId);
      const durationMillis = Math.max(0, Number(active?.durationSeconds) || 0) * 1000;
      if (active && entry.updatedAt > Date.now() - 90 * 86_400_000 && entry.positionMillis > 3000
        && (!durationMillis || entry.positionMillis < durationMillis - 5000)) continueNodes.push(node(active));
    } catch {
      // A failed bounded enrichment never blocks the immediate CarPlay snapshot.
    }
  }
  sections.push(section("audiobooks", bookNodes, "Your audiobooks will appear here."));
  cachedAudiobookCatalog = { tracks, sections, continueNodes };
  return cachedAudiobookCatalog;
}

async function collectRadio(preferences?: CarPlayPreferenceSnapshot) {
  await Promise.all(["featured", "trending", "popular", "recommended"].map((key) =>
    hydrateCachedRadioStations(key).catch(() => [])));
  const recent = (await loadRecentlyPlayedRadioItems(16)).stations;
  const favoriteIds = new Set(getFavorites().filter((item) => item.type === "radio_station")
    .map((item) => clean(item.id).replace(/^radio-/, "")));
  const cached = uniqueById([
    ...(readCachedRadioStations("recommended") || []),
    ...(readCachedRadioStations("featured") || []),
    ...(readCachedRadioStations("trending") || []),
    ...(readCachedRadioStations("popular") || []),
    ...recent,
  ], (station) => station.id);
  const favorite = cached.filter((station) => favoriteIds.has(clean(station.id)));
  const recentIds = new Set(recent.map((station) => clean(station.id)));
  const preferenceTokens = new Set([...(preferences?.genres || []), ...(preferences?.radioIds || [])]);
  const recommended = (readCachedRadioStations("recommended") || [])
    .filter((station) => !favoriteIds.has(clean(station.id)) && !recentIds.has(clean(station.id)))
    .map((station, index) => ({ station, index, score: (preferenceTokens.has(clean(station.id).toLowerCase()) ? 20 : 0)
      + (station.tags || []).filter((tag) => preferenceTokens.has(clean(tag).toLowerCase())).length * 5 }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(({ station }) => station);
  const country = cached.filter((station) => Boolean(clean(station.country)));
  const genre = cached.filter((station) => Array.isArray(station.tags) && station.tags.some((tag) => clean(tag)));
  const popular = readCachedRadioStations("popular") || [];
  const groups = {
    radio_favorites: favorite,
    radio_recent: recent,
    radio_recommended: recommended,
    radio_country: country,
    radio_genre: genre,
    radio_popular: popular,
    radio_recently_added: [] as HiddenTunesStation[],
  };
  const tracks = uniqueById(Object.values(groups).flat(), (station) => station.id)
    .map(stationTrack).filter((item): item is ExtendedTrack => Boolean(item));
  const byId = new Map(tracks.map((track) => [clean(track.stationId), track]));
  const sections = Object.entries(groups).map(([parentId, stations]) => section(
    parentId,
    uniqueById(stations, (station) => station.id).map((station) => byId.get(station.id))
      .filter((item): item is ExtendedTrack => Boolean(item)).slice(0, CAPS.radioGroup).map(node),
    parentId === "radio_favorites" ? "Favorite stations will appear here."
      : parentId === "radio_recent" ? "Your recent stations will appear here."
        : parentId === "radio_recommended" ? "Station recommendations will appear as you listen."
          : parentId === "radio_country" ? "Stations by country will appear here."
            : parentId === "radio_genre" ? "Stations by genre will appear here."
              : parentId === "radio_popular" ? "Popular stations will appear here."
                : "Recently added stations will appear here."
  ));
  sections.push({ parentId: "radio_browse", items: [
    { mediaId: "radio_country", title: "By Country", subtitle: "Stations around the world", playable: false },
    { mediaId: "radio_genre", title: "By Genre", subtitle: "Browse listening styles", playable: false },
    { mediaId: "radio_popular", title: "Popular", subtitle: "Popular live stations", playable: false },
    { mediaId: "radio_recently_added", title: "Recently Added", subtitle: "New stations", playable: false },
  ] });
  return { tracks, sections };
}

export async function collectCarPlayPremiumCatalog(options?: {
  allowNetwork?: boolean; preferences?: CarPlayPreferenceSnapshot;
}) {
  const [podcasts, audiobooks, radio] = await Promise.all([
    collectPodcasts(Boolean(options?.allowNetwork), options?.preferences),
    collectAudiobooks(Boolean(options?.allowNetwork)), collectRadio(options?.preferences),
  ]);
  const continueListening = [...podcasts.continueNodes, ...audiobooks.continueNodes].slice(0, 6);
  return {
    premiumTracks: [...continueListening.map((item) =>
      [...podcasts.tracks, ...audiobooks.tracks].find((track) => track.mediaId === item.mediaId)!),
      ...podcasts.tracks, ...audiobooks.tracks, ...radio.tracks].filter(Boolean),
    premiumSections: [
      section("continue_listening", continueListening, "Your unfinished listening will appear here."),
      section("recommended_podcasts", [], "Podcast recommendations will appear as you listen."),
      ...podcasts.sections,
      ...audiobooks.sections,
      ...radio.sections,
    ],
  };
}

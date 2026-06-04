import React, { memo, useMemo } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import MediaCard from "./MediaCard";
import { COLORS } from "../constants/theme";
import type { UniversalSearchGroupedResults as GroupedResults } from "../services/universalSearchService";
import type { UniversalMatchReason } from "../utils/universalSearch";
import { UNIVERSAL_SEARCH_EMPTY_SUGGESTIONS } from "../utils/universalSearch";
import { isSameSearchInputQuery } from "../utils/searchInputTiming";
import {
  createStableKeyExtractor,
  getNestedSongListLayout,
  LIST_ITEM_HEIGHTS,
} from "../utils/performanceMode";

type Props = {
  grouped: GroupedResults;
  query: string;
  onSongPress: (song: any) => void;
  onLyricPress: (song: any) => void;
  onArtistPress: (artist: any) => void;
  onAlbumPress: (album: any) => void;
  onGenrePress: (genre: any) => void;
  onPlaylistPress?: (playlist: any) => void;
  onTvPress: (video: any) => void;
  onSuggestionPress: (text: string) => void;
  activeSongId?: string | null;
  isPlaying?: boolean;
  showEmpty?: boolean;
};

const MatchReasonPill = memo(function MatchReasonPill({
  reason,
}: {
  reason: UniversalMatchReason;
}) {
  return (
    <View style={styles.reasonPill}>
      <Text style={styles.reasonText}>{reason}</Text>
    </View>
  );
});

const SectionHeader = memo(function SectionHeader({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  if (!count) return null;

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCount}>{count}</Text>
    </View>
  );
});

const SONG_ROW_HEIGHT = LIST_ITEM_HEIGHTS.searchResultRow;
const songKeyExtractor = createStableKeyExtractor("search-song");
const getSongItemLayout = getNestedSongListLayout(SONG_ROW_HEIGHT);

type SearchSongHit = GroupedResults["songs"][number];

const SearchSongRow = memo(function SearchSongRow({
  hit,
  onPress,
}: {
  hit: SearchSongHit;
  onPress: (song: any) => void;
}) {
  const handlePress = () => onPress(hit.payload);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.rowCard}
      onPress={handlePress}
    >
      <MediaCard
        title={hit.payload.title}
        subtitle={hit.subtitle || hit.payload.artist}
        image={hit.payload}
        type="song"
        size="medium"
        showPlayButton={false}
        onPress={handlePress}
      />
      <MatchReasonPill reason={hit.reason} />
    </TouchableOpacity>
  );
});

function UniversalSearchGroupedResults({
  grouped,
  query,
  onSongPress,
  onLyricPress,
  onArtistPress,
  onAlbumPress,
  onGenrePress,
  onPlaylistPress,
  onTvPress,
  onSuggestionPress,
  activeSongId,
  isPlaying,
  showEmpty = false,
}: Props) {
  const renderSongRow = useMemo(
    () =>
      ({ item }: { item: SearchSongHit }) => (
        <SearchSongRow hit={item} onPress={onSongPress} />
      ),
    [onSongPress]
  );

  if (!grouped.hasAnyResults) {
    if (!showEmpty) {
      return null;
    }

    return (
      <View style={styles.emptyBox}>
        <Ionicons name="search-outline" size={40} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>No exact matches found</Text>
        <Text style={styles.emptyText}>
          Try another title, artist, album, genre, mood, or lyric phrase.
        </Text>
        <View style={styles.chipWrap}>
          {UNIVERSAL_SEARCH_EMPTY_SUGGESTIONS.map((chip) => (
            <TouchableOpacity
              key={chip}
              activeOpacity={0.86}
              style={styles.suggestionChip}
              onPress={() => onSuggestionPress(chip)}
            >
              <Text style={styles.suggestionChipText}>{chip}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  const topResults = grouped.topResults.filter((hit) => !hit.id.startsWith("tv:"));

  return (
    <View style={styles.container}>
      {topResults.length > 0 && (
        <View style={styles.sectionBlock}>
          <SectionHeader
            title={topResults.length === 1 ? "Top Result" : "Best Matches"}
            count={topResults.length}
          />
          {topResults.map((hit) => {
            if (hit.id.startsWith("tv:")) {
              const video = hit.payload as any;
              return (
                <TouchableOpacity
                  key={hit.id}
                  activeOpacity={0.88}
                  style={styles.rowCard}
                  onPress={() => onTvPress(video)}
                >
                  <MediaCard
                    title={video.title}
                    subtitle={hit.subtitle || "Hidden Tunes TV"}
                    image={{
                      uri:
                        video.thumbnail_url ||
                        `https://img.youtube.com/vi/${video.source_id}/hqdefault.jpg`,
                    }}
                    type="radio"
                    size="medium"
                    showPlayButton={false}
                    onPress={() => onTvPress(video)}
                  />
                  <MatchReasonPill reason={hit.reason} />
                </TouchableOpacity>
              );
            }

            if (hit.id.startsWith("artist:")) {
              const artist = hit.payload as any;
              return (
                <TouchableOpacity
                  key={hit.id}
                  activeOpacity={0.88}
                  style={styles.rowCard}
                  onPress={() => onArtistPress(artist)}
                >
                  <MediaCard
                    title={artist.name}
                    subtitle={hit.subtitle || "Artist"}
                    image={artist}
                    artworkCandidates={artist.songs || []}
                    type="artist"
                    size="medium"
                    showPlayButton={false}
                    onPress={() => onArtistPress(artist)}
                  />
                  <MatchReasonPill reason={hit.reason} />
                </TouchableOpacity>
              );
            }

            if (hit.id.startsWith("album:")) {
              const album = hit.payload as any;
              return (
                <TouchableOpacity
                  key={hit.id}
                  activeOpacity={0.88}
                  style={styles.rowCard}
                  onPress={() => onAlbumPress(album)}
                >
                  <MediaCard
                    title={album.title}
                    subtitle={hit.subtitle || album.artist}
                    image={album}
                    artworkCandidates={album.songs || []}
                    type="album"
                    size="medium"
                    showPlayButton={false}
                    onPress={() => onAlbumPress(album)}
                  />
                  <MatchReasonPill reason={hit.reason} />
                </TouchableOpacity>
              );
            }

            if (hit.id.startsWith("genre:") || hit.id.startsWith("room:")) {
              const genre = hit.payload as any;
              return (
                <TouchableOpacity
                  key={hit.id}
                  activeOpacity={0.88}
                  style={styles.compactRow}
                  onPress={() => onGenrePress(genre)}
                >
                  <Text style={styles.compactEmoji}>{genre.emoji || "🎵"}</Text>
                  <View style={styles.compactTextBox}>
                    <Text style={styles.compactTitle}>{genre.title}</Text>
                    <MatchReasonPill reason={hit.reason} />
                  </View>
                </TouchableOpacity>
              );
            }

            if (hit.id.startsWith("playlist:")) {
              const playlist = hit.payload as any;
              return (
                <TouchableOpacity
                  key={hit.id}
                  activeOpacity={0.88}
                  style={styles.rowCard}
                  onPress={() => onPlaylistPress?.(playlist)}
                >
                  <MediaCard
                    title={playlist.title}
                    subtitle={hit.subtitle || "Collection"}
                    image={playlist}
                    artworkCandidates={playlist.songs || []}
                    type="album"
                    size="medium"
                    showPlayButton={false}
                    onPress={() => onPlaylistPress?.(playlist)}
                  />
                  <MatchReasonPill reason={hit.reason} />
                </TouchableOpacity>
              );
            }

            const song = hit.payload as any;
            const active = activeSongId === song.id;

            return (
              <TouchableOpacity
                key={hit.id}
                activeOpacity={0.88}
                style={[styles.rowCard, active && styles.rowCardActive]}
                onPress={() =>
                  hit.id.startsWith("lyric:") ? onLyricPress(song) : onSongPress(song)
                }
              >
                <MediaCard
                  title={song.title}
                  subtitle={hit.subtitle || song.artist}
                  image={song}
                  type="song"
                  size="medium"
                  showPlayButton={false}
                  onPress={() =>
                    hit.id.startsWith("lyric:") ? onLyricPress(song) : onSongPress(song)
                  }
                />
                <MatchReasonPill reason={hit.reason} />
                {hit.lyricSnippet ? (
                  <Text style={styles.lyricSnippet} numberOfLines={2}>
                    {hit.lyricSnippet}
                  </Text>
                ) : null}
                {active ? (
                  <Text style={styles.nowPlayingHint}>
                    {isPlaying ? "Now playing" : "Selected"}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {grouped.artists.length > 0 && (
        <View style={styles.sectionBlock}>
          <SectionHeader title="Artists" count={grouped.artists.length} />
          {grouped.artists.map((hit) => (
            <TouchableOpacity
              key={hit.id}
              activeOpacity={0.88}
              style={styles.rowCard}
              onPress={() => onArtistPress(hit.payload)}
            >
              <MediaCard
                title={hit.payload.name}
                subtitle={hit.subtitle || "Artist"}
                image={hit.payload}
                artworkCandidates={(hit.payload as any).songs || []}
                type="artist"
                size="medium"
                showPlayButton={false}
                onPress={() => onArtistPress(hit.payload)}
              />
              <MatchReasonPill reason={hit.reason} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {grouped.songs.length > 0 && (
        <View style={styles.sectionBlock}>
          <SectionHeader title="Songs" count={grouped.songs.length} />
          <FlatList
            data={grouped.songs}
            scrollEnabled={false}
            nestedScrollEnabled
            keyExtractor={songKeyExtractor}
            renderItem={renderSongRow}
            getItemLayout={getSongItemLayout}
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            windowSize={5}
            removeClippedSubviews
          />
        </View>
      )}

      {grouped.lyrics.length > 0 && (
        <View style={styles.sectionBlock}>
          <SectionHeader title="Lyrics Matches" count={grouped.lyrics.length} />
          {grouped.lyrics.map((hit) => (
            <TouchableOpacity
              key={hit.id}
              activeOpacity={0.88}
              style={styles.rowCard}
              onPress={() => onLyricPress(hit.payload)}
            >
              <MediaCard
                title={hit.payload.title}
                subtitle={hit.payload.artist}
                image={hit.payload}
                type="song"
                size="medium"
                showPlayButton={false}
                onPress={() => onLyricPress(hit.payload)}
              />
              <MatchReasonPill reason={hit.reason} />
              {hit.lyricSnippet ? (
                <Text style={styles.lyricSnippet} numberOfLines={3}>
                  {hit.lyricSnippet}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {grouped.albums.length > 0 && (
        <View style={styles.sectionBlock}>
          <SectionHeader title="Albums" count={grouped.albums.length} />
          {grouped.albums.map((hit) => (
            <TouchableOpacity
              key={hit.id}
              activeOpacity={0.88}
              style={styles.rowCard}
              onPress={() => onAlbumPress(hit.payload)}
            >
              <MediaCard
                title={hit.payload.title}
                subtitle={hit.subtitle || hit.payload.artist}
                image={hit.payload}
                artworkCandidates={(hit.payload as any).songs || []}
                type="album"
                size="medium"
                showPlayButton={false}
                onPress={() => onAlbumPress(hit.payload)}
              />
              <MatchReasonPill reason={hit.reason} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {grouped.genreMoods.length > 0 && (
        <View style={styles.sectionBlock}>
          <SectionHeader title="Genres" count={grouped.genreMoods.length} />
          <View style={styles.genreWrap}>
            {grouped.genreMoods.map((hit) => (
              <TouchableOpacity
                key={hit.id}
                activeOpacity={0.86}
                style={styles.genreChip}
                onPress={() => onGenrePress(hit.payload)}
              >
                <Text style={styles.genreEmoji}>{hit.payload.emoji || "🎵"}</Text>
                <Text style={styles.genreChipText}>{hit.payload.title}</Text>
                <Text style={styles.genreReason}>{hit.reason}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {grouped.moodRooms.length > 0 && (
        <View style={styles.sectionBlock}>
          <SectionHeader title="Mood Rooms" count={grouped.moodRooms.length} />
          <View style={styles.genreWrap}>
            {grouped.moodRooms.map((hit) => (
              <TouchableOpacity
                key={hit.id}
                activeOpacity={0.86}
                style={styles.genreChip}
                onPress={() => onGenrePress(hit.payload)}
              >
                <Text style={styles.genreEmoji}>{hit.payload.emoji || "✨"}</Text>
                <Text style={styles.genreChipText}>{hit.payload.title}</Text>
                <Text style={styles.genreReason}>{hit.reason}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {grouped.playlists.length > 0 && (
        <View style={styles.sectionBlock}>
          <SectionHeader title="Playlists & Collections" count={grouped.playlists.length} />
          {grouped.playlists.map((hit) => (
            <TouchableOpacity
              key={hit.id}
              activeOpacity={0.88}
              style={styles.rowCard}
              onPress={() => onPlaylistPress?.(hit.payload)}
            >
              <MediaCard
                title={hit.payload.title}
                subtitle={hit.subtitle || hit.payload.description || "Collection"}
                image={hit.payload}
                artworkCandidates={(hit.payload as any).songs || []}
                type="album"
                size="medium"
                showPlayButton={false}
                onPress={() => onPlaylistPress?.(hit.payload)}
              />
              <MatchReasonPill reason={hit.reason} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {grouped.internetAudio.length > 0 && (
        <View style={styles.sectionBlock}>
          <SectionHeader title="Internet Audio" count={grouped.internetAudio.length} />
          <FlatList
            data={grouped.internetAudio}
            scrollEnabled={false}
            nestedScrollEnabled
            keyExtractor={songKeyExtractor}
            renderItem={renderSongRow}
            getItemLayout={getSongItemLayout}
            initialNumToRender={6}
            maxToRenderPerBatch={4}
            windowSize={4}
            removeClippedSubviews
          />
        </View>
      )}

      {grouped.tv.length > 0 && (
        <View style={styles.sectionBlock}>
          <SectionHeader title="Videos" count={grouped.tv.length} />
          {grouped.tv.map((hit) => {
            const video = hit.payload as any;
            return (
              <TouchableOpacity
                key={hit.id}
                activeOpacity={0.88}
                style={styles.rowCard}
                onPress={() => onTvPress(video)}
              >
                <MediaCard
                  title={video.title}
                  subtitle={hit.subtitle || "Hidden Tunes TV"}
                  image={{
                    uri:
                      video.thumbnail_url ||
                      `https://img.youtube.com/vi/${video.source_id}/hqdefault.jpg`,
                  }}
                  type="radio"
                  size="medium"
                  showPlayButton={false}
                  onPress={() => onTvPress(video)}
                />
                <MatchReasonPill reason={hit.reason} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

    </View>
  );
}

export default memo(UniversalSearchGroupedResults, (previous, next) => {
  return (
    previous.grouped === next.grouped &&
    isSameSearchInputQuery(previous.query, next.query) &&
    previous.activeSongId === next.activeSongId &&
    previous.isPlaying === next.isPlaying &&
    previous.showEmpty === next.showEmpty &&
    previous.onSongPress === next.onSongPress &&
    previous.onLyricPress === next.onLyricPress &&
    previous.onArtistPress === next.onArtistPress &&
    previous.onAlbumPress === next.onAlbumPress &&
    previous.onGenrePress === next.onGenrePress &&
    previous.onPlaylistPress === next.onPlaylistPress &&
    previous.onTvPress === next.onTvPress &&
    previous.onSuggestionPress === next.onSuggestionPress
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  sectionBlock: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },
  sectionCount: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  rowCard: {
    marginBottom: 9,
    borderRadius: 17,
    padding: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rowCardActive: {
    borderColor: "rgba(168,85,247,0.45)",
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  reasonPill: {
    alignSelf: "flex-start",
    marginTop: 8,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: "rgba(168,85,247,0.1)",
  },
  reasonText: {
    color: COLORS.primaryGlow,
    fontSize: 10,
    fontWeight: "800",
  },
  lyricSnippet: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    fontStyle: "italic",
  },
  nowPlayingHint: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 6,
  },
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 9,
    padding: 11,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  compactEmoji: {
    fontSize: 22,
    marginRight: 10,
  },
  compactTextBox: {
    flex: 1,
    gap: 6,
  },
  compactTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  genreWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  genreChip: {
    minWidth: 120,
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  genreEmoji: {
    fontSize: 17,
    marginBottom: 4,
  },
  genreChipText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },
  genreReason: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 4,
    fontWeight: "700",
  },

  emptyBox: {
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 12,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 12,
    textAlign: "center",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 7,
    lineHeight: 18,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 16,
  },
  suggestionChip: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: "rgba(168,85,247,0.16)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.28)",
  },
  suggestionChipText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
});

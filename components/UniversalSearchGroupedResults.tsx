import React, { memo, useMemo } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import MediaCard from "./MediaCard";
import { COLORS } from "../constants/theme";
import type { UniversalSearchGroupedResults as GroupedResults } from "../services/universalSearchService";
import type { UniversalMatchReason } from "../utils/universalSearch";
import { UNIVERSAL_SEARCH_EMPTY_SUGGESTIONS } from "../utils/universalSearch";
import { isSameSearchInputQuery } from "../utils/searchInputTiming";
import { useDebouncedSearchQuery } from "../utils/useDebouncedValue";
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
  onTvPress,
  onSuggestionPress,
  activeSongId,
  isPlaying,
  showEmpty = false,
}: Props) {
  const debouncedQuery = useDebouncedSearchQuery(query);
  const displayQuery = useMemo(() => {
    if (isSameSearchInputQuery(query, debouncedQuery)) {
      return debouncedQuery.trim();
    }
    return debouncedQuery.trim() || query.trim();
  }, [debouncedQuery, query]);

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
          Try another title, artist, album, genre, or mood.
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

  return (
    <View style={styles.container}>
      {grouped.topResults.length > 0 && (
        <View style={styles.sectionBlock}>
          <SectionHeader title="Top Results" count={grouped.topResults.length} />
          {grouped.topResults.map((hit) => {
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
                    type="album"
                    size="medium"
                    showPlayButton={false}
                    onPress={() => onAlbumPress(album)}
                  />
                  <MatchReasonPill reason={hit.reason} />
                </TouchableOpacity>
              );
            }

            if (hit.id.startsWith("genre:")) {
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
          <SectionHeader title="Lyrics" count={grouped.lyrics.length} />
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
          <SectionHeader
            title="Genres & Moods"
            count={grouped.genreMoods.length}
          />
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

      {grouped.tv.length > 0 && (
        <View style={styles.sectionBlock}>
          <SectionHeader title="TV" count={grouped.tv.length} />
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

      {displayQuery.length >= 2 ? (
        <Text style={styles.queryHint}>
          Showing matches for “{displayQuery}”
        </Text>
      ) : null}
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
    previous.onTvPress === next.onTvPress &&
    previous.onSuggestionPress === next.onSuggestionPress
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  sectionBlock: {
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  sectionCount: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  rowCard: {
    marginBottom: 10,
    borderRadius: 18,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rowCardActive: {
    borderColor: "rgba(168,85,247,0.45)",
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  reasonPill: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  reasonText: {
    color: COLORS.primary,
    fontSize: 11,
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
    marginBottom: 10,
    padding: 12,
    borderRadius: 18,
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
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  genreEmoji: {
    fontSize: 18,
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
  queryHint: {
    color: COLORS.textDim,
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
    textAlign: "center",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 18,
  },
  suggestionChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
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

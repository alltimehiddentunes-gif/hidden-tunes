import React, { memo } from "react";
import { Text, TouchableOpacity, View, type ViewStyle } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { useTrackPlaybackStatus } from "../../context/playerContextSlices";
import { COLORS, GRADIENTS } from "../../constants/theme";
import type { HiddenTunesNormalizedSong } from "../../services/hiddenTunesApi";
import HTImage from "../HTImage";
import NeonEQ from "../NeonEQ";

type SearchApkSongRowProps = {
  song: HiddenTunesNormalizedSong;
  onPress: () => void;
  styles: {
    songRow: ViewStyle;
    songRowActive: ViewStyle;
    coverBorder: object;
    cover: object;
    songCopy: object;
    songTitle: object;
    songArtist: object;
    songMeta: object;
    playCircle: object;
  };
};

export const SearchApkSongRow = memo(function SearchApkSongRow({
  song,
  onPress,
  styles,
}: SearchApkSongRowProps) {
  const { isActive, isPlaying } = useTrackPlaybackStatus(String(song.id || ""));

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={[styles.songRow, isActive && styles.songRowActive]}
      onPress={onPress}
    >
      <LinearGradient colors={isActive ? GRADIENTS.neon : GRADIENTS.card} style={styles.coverBorder}>
        <HTImage source={song} style={styles.cover} contentFit="cover" />
      </LinearGradient>
      <View style={styles.songCopy}>
        <Text numberOfLines={1} style={styles.songTitle}>
          {song.title}
        </Text>
        <Text numberOfLines={1} style={styles.songArtist}>
          {song.artist || "Hidden Tunes"}
        </Text>
        <Text numberOfLines={1} style={styles.songMeta}>
          {song.album || song.genre || song.mood || "Catalog result"}
        </Text>
      </View>
      {isActive && isPlaying ? (
        <NeonEQ isPlaying={isPlaying} size="small" />
      ) : (
        <View style={styles.playCircle}>
          <Ionicons name="play" size={16} color={COLORS.text} />
        </View>
      )}
    </TouchableOpacity>
  );
});

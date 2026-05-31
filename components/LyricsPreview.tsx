import { memo, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../constants/theme";
import {
  usePlayerNowPlaying,
  usePlayerProgress,
  usePlayerState,
} from "../context/playerContextSlices";
import {
  getBestLyricsPayload,
  resolveLyricsDisplay,
  type LyricsDisplayMode,
} from "../utils/lyrics";

type LyricsPreviewProps = {
  onPress: () => void;
  loading?: boolean;
};

function getModeLabel(mode: LyricsDisplayMode) {
  if (mode === "synced") return "Live synced";
  if (mode === "plain") return "Plain lyrics";
  return "Lyrics";
}

const LyricsPreview = memo(function LyricsPreview({
  onPress,
  loading = false,
}: LyricsPreviewProps) {
  const { currentSong } = usePlayerNowPlaying();
  const { currentLyricLine } = usePlayerProgress();
  const { currentLyrics } = usePlayerState();

  const preview = useMemo(() => {
    if (!currentSong) {
      return {
        mode: "none" as LyricsDisplayMode,
        hasLyrics: false,
        lineText: "",
      };
    }

    const payload = getBestLyricsPayload({
      synced_lrc:
        currentSong.syncedLyrics ||
        currentSong.synced_lyrics ||
        currentSong.lrc,
      plain_lyrics: currentLyrics || currentSong.lyrics,
    });

    const resolved = resolveLyricsDisplay(payload.synced, payload.plain);

    if (resolved.mode === "none") {
      return {
        mode: resolved.mode,
        hasLyrics: false,
        lineText: "",
      };
    }

    const fallbackLine = resolved.lines[0]?.text || "";
    const lineText = currentLyricLine?.text || fallbackLine;

    return {
      mode: resolved.mode,
      hasLyrics: true,
      lineText,
    };
  }, [currentLyricLine?.text, currentLyrics, currentSong]);

  if (!currentSong) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.card}
      onPress={onPress}
      disabled={loading}
    >
      <View style={styles.headerRow}>
        <View style={styles.labelRow}>
          <Ionicons
            name={preview.hasLyrics ? "musical-notes" : "document-text-outline"}
            size={14}
            color={COLORS.primary}
          />
          <Text style={styles.label}>{getModeLabel(preview.mode)}</Text>
        </View>

        <Ionicons
          name={loading ? "sync" : "chevron-forward"}
          size={16}
          color={COLORS.textMuted}
        />
      </View>

      {preview.hasLyrics ? (
        <Text numberOfLines={2} style={styles.lineText}>
          {loading ? "Loading lyrics..." : preview.lineText || "Tap to open lyrics"}
        </Text>
      ) : (
        <Text numberOfLines={2} style={styles.emptyText}>
          Lyrics aren&apos;t available for this track yet.
        </Text>
      )}
    </TouchableOpacity>
  );
});

export default LyricsPreview;

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  label: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  lineText: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },

  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
});

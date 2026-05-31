import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "../constants/theme";
import {
  clearPlaybackCriticalLogs,
  formatPlaybackCriticalLogsForExport,
  getPlaybackCriticalLogs,
  hydratePlaybackCriticalLogs,
  subscribePlaybackCriticalLogs,
  type PlaybackCriticalLogEntry,
} from "../utils/playbackCriticalLogs";

function formatTime(at: number) {
  try {
    return new Date(at).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(at);
  }
}

function LogRow({ entry }: { entry: PlaybackCriticalLogEntry }) {
  const detailKeys = Object.keys(entry.details).filter(
    (key) => key !== "at" && key !== "platform" && key !== "appState"
  );

  return (
    <View style={styles.logCard}>
      <View style={styles.logHeader}>
        <Text style={styles.logEvent}>{entry.event}</Text>
        <Text style={styles.logTime}>{formatTime(entry.at)}</Text>
      </View>
      <Text style={styles.logMeta}>
        {entry.platform} · {entry.appState}
      </Text>
      {detailKeys.length > 0 ? (
        <Text style={styles.logDetails} selectable>
          {detailKeys
            .map((key) => `${key}=${String(entry.details[key])}`)
            .join(" · ")}
        </Text>
      ) : null}
      <Text style={styles.logLine} selectable>
        {entry.line}
      </Text>
    </View>
  );
}

export default function PlaybackDiagnosticsScreen() {
  const [logs, setLogs] = useState<PlaybackCriticalLogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const refreshLogs = useCallback(() => {
    setLogs(getPlaybackCriticalLogs());
  }, []);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      await hydratePlaybackCriticalLogs();
      if (mounted) {
        refreshLogs();
      }
    })();

    const unsubscribe = subscribePlaybackCriticalLogs(() => {
      if (mounted) {
        refreshLogs();
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [refreshLogs]);

  const exportText = useMemo(() => formatPlaybackCriticalLogsForExport(logs), [logs]);

  const handleCopy = useCallback(async () => {
    if (!exportText.length) {
      Alert.alert("No logs", "There are no playback critical logs to copy yet.");
      return;
    }

    setBusy(true);
    try {
      await Clipboard.setStringAsync(exportText);
      Alert.alert("Copied", `${logs.length} log entries copied to clipboard.`);
    } catch {
      Alert.alert("Copy failed", "Could not copy logs to clipboard.");
    } finally {
      setBusy(false);
    }
  }, [exportText, logs.length]);

  const handleClear = useCallback(() => {
    Alert.alert(
      "Clear playback logs?",
      "This removes all stored [HT_PLAYBACK_CRITICAL] events from memory and storage.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await clearPlaybackCriticalLogs();
                refreshLogs();
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  }, [refreshLogs]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Playback diagnostics</Text>
          <Text style={styles.subtitle}>
            Latest {logs.length} · [HT_PLAYBACK_CRITICAL]
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.copyButton]}
          onPress={() => void handleCopy()}
          disabled={busy}
        >
          <Ionicons name="copy-outline" size={18} color={COLORS.text} />
          <Text style={styles.actionLabel}>Copy logs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.clearButton]}
          onPress={handleClear}
          disabled={busy}
        >
          <Ionicons name="trash-outline" size={18} color={COLORS.text} />
          <Text style={styles.actionLabel}>Clear</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        Hidden route: open /playback-diagnostics on device builds when Metro is
        unavailable.
      </Text>

      <FlatList
        data={[...logs].reverse()}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <LogRow entry={item} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No critical logs yet</Text>
            <Text style={styles.emptyText}>
              Play audio, lock the screen, and reproduce the pause. Events will
              appear here automatically.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.cardGlass,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    color: COLORS.textSoft,
    fontSize: 13,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  copyButton: {
    backgroundColor: COLORS.card,
  },
  clearButton: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
  actionLabel: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 14,
  },
  hint: {
    color: COLORS.textDim,
    fontSize: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 10,
  },
  logCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: 12,
    marginBottom: 10,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  logEvent: {
    color: COLORS.primaryGlow,
    fontWeight: "800",
    fontSize: 14,
    flex: 1,
  },
  logTime: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  logMeta: {
    color: COLORS.textSoft,
    fontSize: 12,
    marginTop: 4,
  },
  logDetails: {
    color: COLORS.text,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18,
  },
  logLine: {
    color: COLORS.textDim,
    fontSize: 11,
    marginTop: 8,
    lineHeight: 16,
    fontFamily: "monospace",
  },
  empty: {
    paddingTop: 48,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: {
    color: COLORS.textSoft,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});

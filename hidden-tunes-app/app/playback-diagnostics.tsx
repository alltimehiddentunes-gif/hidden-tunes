// TEMP_PLAYBACK_DIAGNOSTICS
// Temporary diagnostic tool for root-cause testing.
// Safe to remove after playback stabilization.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "../constants/theme";
import {
  clearPlaybackDiagnostics,
  exportPlaybackDiagnosticsText,
  getPlaybackDiagnosticSessionId,
  getPlaybackDiagnostics,
  startPlaybackDiagnosticSession,
  subscribePlaybackDiagnostics,
  type PlaybackDiagnosticEntry,
} from "../services/playbackDiagnostics";

function formatLocalTime(timestamp?: string): string {
  try {
    if (!timestamp) return "Never";
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp || "Never";
  }
}

function formatData(data?: Record<string, unknown>): string {
  try {
    if (!data || Object.keys(data).length === 0) return "";
    return JSON.stringify(data, null, 2);
  } catch {
    return "[Unserializable data]";
  }
}

function DiagnosticRow({ entry }: { entry: PlaybackDiagnosticEntry }) {
  const dataText = formatData(entry.data);

  return (
    <View style={styles.logCard}>
      <View style={styles.logHeader}>
        <Text style={styles.logEvent}>{entry.eventName}</Text>
        <Text style={styles.logTime}>{formatLocalTime(entry.timestamp)}</Text>
      </View>
      <Text style={styles.logMeta} selectable>
        {entry.platform} | {entry.sessionId}
      </Text>
      {dataText ? (
        <Text style={styles.logData} selectable>
          {dataText}
        </Text>
      ) : null}
    </View>
  );
}

export default function PlaybackDiagnosticsScreen() {
  const [logs, setLogs] = useState<PlaybackDiagnosticEntry[]>([]);
  const [sessionId, setSessionId] = useState(getPlaybackDiagnosticSessionId());
  const [busy, setBusy] = useState(false);
  const [copyFallbackText, setCopyFallbackText] = useState("");

  const newestLogs = useMemo(() => [...logs].reverse(), [logs]);
  const latestUpdatedTime = newestLogs[0]?.timestamp;

  const refresh = useCallback(async () => {
    try {
      const nextLogs = await getPlaybackDiagnostics();
      setLogs(nextLogs);
      setSessionId(getPlaybackDiagnosticSessionId());
    } catch {
      // Diagnostics UI should stay non-fatal.
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void refresh();

    const unsubscribe = subscribePlaybackDiagnostics(() => {
      if (mounted) {
        void refresh();
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [refresh]);

  const handleStartSession = useCallback(async () => {
    setBusy(true);
    try {
      const nextSessionId = await startPlaybackDiagnosticSession("manual_screen");
      setSessionId(nextSessionId);
      await refresh();
    } catch {
      Alert.alert("Session not started", "Diagnostics could not start a new session.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handleCopy = useCallback(async () => {
    setBusy(true);
    try {
      const exportText = await exportPlaybackDiagnosticsText();
      setCopyFallbackText(exportText);

      if (!exportText) {
        Alert.alert("No logs", "There are no playback diagnostics to copy yet.");
        return;
      }

      await Clipboard.setStringAsync(exportText);
      Alert.alert("Copied", `${logs.length} diagnostic entries copied.`);
    } catch {
      Alert.alert(
        "Copy failed",
        "The exported text is shown at the bottom of this screen."
      );
    } finally {
      setBusy(false);
    }
  }, [logs.length]);

  const clearLogs = useCallback(async () => {
    setBusy(true);
    try {
      await clearPlaybackDiagnostics();
      setCopyFallbackText("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handleClear = useCallback(() => {
    Alert.alert("Clear logs?", "This removes stored temporary playback diagnostics.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear logs",
        style: "destructive",
        onPress: () => {
          void clearLogs();
        },
      },
    ]);
  }, [clearLogs]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Playback Diagnostics</Text>
        <Text style={styles.subtitle}>
          Hidden manual route for temporary phone testing
        </Text>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Current session</Text>
        <Text style={styles.summaryValue} selectable>
          {sessionId}
        </Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{logs.length}</Text>
            <Text style={styles.summaryCaption}>Total logs</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumberSmall}>
              {formatLocalTime(latestUpdatedTime)}
            </Text>
            <Text style={styles.summaryCaption}>Latest update</Text>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => void refresh()} disabled={busy}>
          <Ionicons name="refresh" size={17} color={COLORS.text} />
          <Text style={styles.actionLabel}>Refresh</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => void handleStartSession()} disabled={busy}>
          <Ionicons name="play-circle-outline" size={17} color={COLORS.text} />
          <Text style={styles.actionLabel}>Start new session</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => void handleCopy()} disabled={busy}>
          <Ionicons name="copy-outline" size={17} color={COLORS.text} />
          <Text style={styles.actionLabel}>Copy logs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.clearButton]}
          onPress={handleClear}
          disabled={busy}
        >
          <Ionicons name="trash-outline" size={17} color={COLORS.text} />
          <Text style={styles.actionLabel}>Clear logs</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={newestLogs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <DiagnosticRow entry={item} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No diagnostics yet</Text>
            <Text style={styles.emptyText}>
              Press Start new session to create a session_start entry.
            </Text>
          </View>
        }
      />

      {copyFallbackText ? (
        <ScrollView style={styles.exportBox} contentContainerStyle={styles.exportContent}>
          <Text style={styles.exportText} selectable>
            {copyFallbackText}
          </Text>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: COLORS.textSoft,
    fontSize: 13,
    marginTop: 4,
  },
  summary: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.card,
  },
  summaryLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  summaryValue: {
    color: COLORS.primaryGlow,
    fontSize: 13,
    marginTop: 6,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  summaryItem: {
    flex: 1,
    minHeight: 68,
    justifyContent: "center",
    padding: 10,
    borderRadius: 10,
    backgroundColor: COLORS.cardGlass,
  },
  summaryNumber: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
  },
  summaryNumberSmall: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
  },
  summaryCaption: {
    color: COLORS.textSoft,
    fontSize: 12,
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardGlass,
  },
  clearButton: {
    borderColor: "rgba(239, 68, 68, 0.35)",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  actionLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  logCard: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.card,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  logEvent: {
    flex: 1,
    color: COLORS.primaryGlow,
    fontSize: 14,
    fontWeight: "800",
  },
  logTime: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  logMeta: {
    color: COLORS.textSoft,
    fontSize: 11,
    marginTop: 6,
  },
  logData: {
    color: COLORS.text,
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  empty: {
    paddingTop: 44,
    alignItems: "center",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
  },
  emptyText: {
    color: COLORS.textSoft,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  exportBox: {
    maxHeight: 130,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: "#050505",
  },
  exportContent: {
    padding: 10,
  },
  exportText: {
    color: COLORS.textSoft,
    fontFamily: "monospace",
    fontSize: 10,
    lineHeight: 15,
  },
});

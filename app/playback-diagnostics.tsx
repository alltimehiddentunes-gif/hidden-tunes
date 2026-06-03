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
  getPlaybackCriticalLogs,
  hydratePlaybackCriticalLogs,
  subscribePlaybackCriticalLogs,
  type PlaybackCriticalLogEntry,
} from "../utils/playbackCriticalLogs";
import {
  clearLockscreenPlaybackDiagnostics,
  getLockscreenPlaybackDiagnosticLogs,
  hydrateLockscreenPlaybackDiagnostics,
  LOCKSCREEN_DIAGNOSTIC_STORAGE_KEY,
  logLockscreenPlaybackDiagnostic,
  subscribeLockscreenPlaybackDiagnostics,
  type LockscreenPlaybackDiagnosticEntry,
} from "../utils/lockscreenPlaybackDiagnostics";

const PLAYBACK_CRITICAL_STORAGE_KEY = "@ht_playback_critical_logs_v1";

type CombinedLogEntry = {
  id: string;
  source: "lockscreen" | "critical";
  event: string;
  at: number;
  platform: string;
  appState: string;
  details: Record<string, unknown>;
  line: string;
};

type EmptyReason =
  | "No logs stored yet"
  | "Storage read failed"
  | "Logs are disabled in this build";

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

function formatDateTime(at: number | null) {
  if (!at) return "None";

  try {
    return new Date(at).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(at);
  }
}

function criticalToCombined(entry: PlaybackCriticalLogEntry): CombinedLogEntry {
  return {
    id: `critical-${entry.id}`,
    source: "critical",
    event: entry.event,
    at: entry.at,
    platform: entry.platform,
    appState: entry.appState,
    details: entry.details,
    line: entry.line,
  };
}

function lockscreenToCombined(
  entry: LockscreenPlaybackDiagnosticEntry
): CombinedLogEntry {
  return {
    id: `lockscreen-${entry.id}`,
    source: "lockscreen",
    event: entry.event,
    at: entry.at,
    platform: entry.platform,
    appState: entry.appState,
    details: entry.details,
    line: entry.line,
  };
}

function buildExportText(logs: CombinedLogEntry[]) {
  return logs
    .sort((a, b) => a.at - b.at)
    .map((entry) => {
      const iso = new Date(entry.at).toISOString();
      return `${iso} [${entry.source}] ${entry.line}`;
    })
    .join("\n");
}

function LogRow({ entry }: { entry: CombinedLogEntry }) {
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
        {entry.source} ? {entry.platform} ? {entry.appState}
      </Text>
      {detailKeys.length > 0 ? (
        <Text style={styles.logDetails} selectable>
          {detailKeys
            .map((key) => `${key}=${String(entry.details[key])}`)
            .join(" ? ")}
        </Text>
      ) : null}
      <Text style={styles.logLine} selectable>
        {entry.line}
      </Text>
    </View>
  );
}

export default function PlaybackDiagnosticsScreen() {
  const [logs, setLogs] = useState<CombinedLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [emptyReason, setEmptyReason] = useState<EmptyReason>("No logs stored yet");
  const [lastReadError, setLastReadError] = useState("");

  const lastLogAt = useMemo(() => {
    if (!logs.length) return null;
    return logs.reduce((latest, entry) => Math.max(latest, entry.at), 0);
  }, [logs]);

  const refreshLogs = useCallback(async () => {
    logLockscreenPlaybackDiagnostic("diagnostics_storage_read_start", {
      screen: "playback-diagnostics",
    });
    setLoading(true);
    setLastReadError("");

    try {
      await Promise.all([
        hydratePlaybackCriticalLogs(),
        hydrateLockscreenPlaybackDiagnostics(),
      ]);

      const combined = [
        ...getPlaybackCriticalLogs().map(criticalToCombined),
        ...getLockscreenPlaybackDiagnosticLogs().map(lockscreenToCombined),
      ].sort((a, b) => b.at - a.at);

      setLogs(combined);
      setEmptyReason("No logs stored yet");
      logLockscreenPlaybackDiagnostic("diagnostics_storage_read_success", {
        screen: "playback-diagnostics",
        count: combined.length,
        lockscreenCount: getLockscreenPlaybackDiagnosticLogs().length,
        criticalCount: getPlaybackCriticalLogs().length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLogs([]);
      setLastReadError(message);
      setEmptyReason("Storage read failed");
      logLockscreenPlaybackDiagnostic("diagnostics_storage_read_failed", {
        screen: "playback-diagnostics",
        message,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    logLockscreenPlaybackDiagnostic("diagnostics_view_opened", {
      screen: "playback-diagnostics",
      lockscreenStorageKey: LOCKSCREEN_DIAGNOSTIC_STORAGE_KEY,
      criticalStorageKey: PLAYBACK_CRITICAL_STORAGE_KEY,
    });

    void refreshLogs();

    const unsubscribeCritical = subscribePlaybackCriticalLogs(() => {
      const combined = [
        ...getPlaybackCriticalLogs().map(criticalToCombined),
        ...getLockscreenPlaybackDiagnosticLogs().map(lockscreenToCombined),
      ].sort((a, b) => b.at - a.at);
      setLogs(combined);
    });

    const unsubscribeLockscreen = subscribeLockscreenPlaybackDiagnostics(() => {
      const combined = [
        ...getPlaybackCriticalLogs().map(criticalToCombined),
        ...getLockscreenPlaybackDiagnosticLogs().map(lockscreenToCombined),
      ].sort((a, b) => b.at - a.at);
      setLogs(combined);
    });

    return () => {
      unsubscribeCritical();
      unsubscribeLockscreen();
    };
  }, [refreshLogs]);

  const exportText = useMemo(() => buildExportText(logs), [logs]);

  const handleCopy = useCallback(async () => {
    logLockscreenPlaybackDiagnostic("diagnostics_copy_pressed", {
      count: logs.length,
    });

    if (!exportText.length) {
      Alert.alert("No logs", "There are no stored diagnostics to copy yet.");
      return;
    }

    setBusy(true);
    try {
      await Clipboard.setStringAsync(exportText);
      Alert.alert("Copied", `${logs.length} log entries copied to clipboard.`);
    } catch {
      Alert.alert("Copy failed", "Could not copy diagnostics to clipboard.");
    } finally {
      setBusy(false);
    }
  }, [exportText, logs.length]);

  const handleClear = useCallback(() => {
    Alert.alert(
      "Clear diagnostics?",
      "This removes stored playback diagnostics from memory and AsyncStorage.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await Promise.all([
                  clearPlaybackCriticalLogs(),
                  clearLockscreenPlaybackDiagnostics(),
                ]);
                setLogs([]);
                setEmptyReason("No logs stored yet");
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  }, []);

  const listData = useMemo(() => logs, [logs]);

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
            {loading ? "Loading logs..." : `${logs.length} loaded ? Last ${formatDateTime(lastLogAt)}`}
          </Text>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Stored diagnostics</Text>
        <Text style={styles.summaryText}>Count: {logs.length}</Text>
        <Text style={styles.summaryText}>Last log: {formatDateTime(lastLogAt)}</Text>
        <Text style={styles.summaryText}>Lockscreen key: {LOCKSCREEN_DIAGNOSTIC_STORAGE_KEY}</Text>
        <Text style={styles.summaryText}>Critical key: {PLAYBACK_CRITICAL_STORAGE_KEY}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.refreshButton]}
          onPress={() => void refreshLogs()}
          disabled={busy || loading}
        >
          <Ionicons name="refresh-outline" size={18} color={COLORS.text} />
          <Text style={styles.actionLabel}>Refresh</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.copyButton]}
          onPress={() => void handleCopy()}
          disabled={busy}
        >
          <Ionicons name="copy-outline" size={18} color={COLORS.text} />
          <Text style={styles.actionLabel}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.clearButton]}
          onPress={handleClear}
          disabled={busy || loading}
        >
          <Ionicons name="trash-outline" size={18} color={COLORS.text} />
          <Text style={styles.actionLabel}>Clear</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        Open Profile ? Diagnostics in preview builds to refresh and copy stored lockscreen playback logs.
      </Text>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <LogRow entry={item} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{loading ? "Loading logs" : emptyReason}</Text>
            <Text style={styles.emptyText}>
              {loading
                ? "Reading diagnostics from AsyncStorage."
                : emptyReason === "Storage read failed"
                  ? lastReadError || "The diagnostics storage read failed."
                  : emptyReason === "Logs are disabled in this build"
                    ? "Diagnostics are disabled in this build."
                    : "No logs stored yet. Start playback, lock the phone, reproduce the issue, then tap Refresh."}
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
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  summaryTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 6,
  },
  summaryText: {
    color: COLORS.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  refreshButton: {
    backgroundColor: COLORS.cardGlass,
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
    fontSize: 13,
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

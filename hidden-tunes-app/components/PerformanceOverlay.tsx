import { memo, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  getLastScreenSnapshot,
  getPerformanceDiagnostics,
  logPerformanceDiagnosticsOverlay,
} from "../utils/performanceLogs";
import { getImagePrefetchStatus } from "../utils/imagePreloader";
import { getPlaybackRenderDiagnostics } from "../utils/playbackRenderDiagnostics";
import { getPlaybackStressDiagnostics } from "../utils/playbackStressDiagnostics";
import { getRenderDiagnostics } from "../utils/renderDiagnostics";
import { getStartupDiagnostics } from "../utils/startupDiagnostics";

function PerformanceOverlayPanel() {
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((current) => current + 1);
    }, 1500);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    logPerformanceDiagnosticsOverlay(
      getLastScreenSnapshot()?.screen || "global"
    );
  }, [tick]);

  const diagnostics = getPerformanceDiagnostics();
  const renderDiagnostics = getRenderDiagnostics();
  const playbackDiagnostics = getPlaybackRenderDiagnostics();
  const startupDiagnostics = getStartupDiagnostics();
  const stressDiagnostics = getPlaybackStressDiagnostics();
  const lastScreen = getLastScreenSnapshot();
  const prefetch = getImagePrefetchStatus();
  const topRenderCounts = Object.entries(renderDiagnostics.rerenderCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3);
  const latestStressWarning =
    stressDiagnostics.stressWarnings[stressDiagnostics.stressWarnings.length - 1];

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.panel, expanded && styles.panelExpanded]}
        onPress={() => setExpanded((current) => !current)}
      >
        <Text style={styles.title}>HT Perf</Text>

        <Text style={styles.line}>
          Tap→audio: {diagnostics.avgTapToAudioStartMs || "—"}ms (
          {stressDiagnostics.tapToAudioSampleCount})
        </Text>
        <Text style={styles.line}>
          Next: {diagnostics.avgNextTrackTransitionMs || "—"}ms | Pause:{" "}
          {diagnostics.avgPauseResumeMs || "—"}ms
        </Text>
        <Text style={styles.line}>
          Screen: {lastScreen?.screen || "—"} ({lastScreen?.readyMs ?? "—"}ms)
        </Text>

        {expanded ? (
          <>
            <Text style={styles.line}>
              Session: {diagnostics.playbackSessionMinutes}m | Queue:{" "}
              {stressDiagnostics.queueLength}
            </Text>
            <Text style={styles.line}>
              Startup cache: {diagnostics.startupFirstCachedMs ?? "—"}ms | API:{" "}
              {diagnostics.startupFirstApiMs ?? "—"}ms
            </Text>
            <Text style={styles.line}>
              Offline starts: {diagnostics.offlineCacheStartups} | Snapshots:{" "}
              {stressDiagnostics.snapshotFallbackUses}
            </Text>
            <Text style={styles.line}>
              Artwork: {prefetch.loadedCount} loaded /{" "}
              {stressDiagnostics.artworkPrefetchAttempts} tries
            </Text>
            <Text style={styles.line}>
              Deferred: {diagnostics.activeDeferredTasks} active | Timers:{" "}
              {stressDiagnostics.activeTimerCount}
            </Text>
            <Text style={styles.line}>
              Reload window: {diagnostics.audioReloadWindowCount} | Queue stress:{" "}
              {diagnostics.queueTortureWarnings}
            </Text>
            <Text style={styles.line}>
              Cache hit: {diagnostics.cacheHitRate}% | Render:{" "}
              {diagnostics.renderRerenderSamples}
            </Text>
            <Text style={styles.line}>
              Progress/min: {diagnostics.playbackProgressUpdatesPerMinute}
            </Text>
            {topRenderCounts.map(([name, count]) => (
              <Text key={name} style={styles.line}>
                {name}: {count}
              </Text>
            ))}
            {latestStressWarning ? (
              <Text style={styles.warning}>{latestStressWarning}</Text>
            ) : null}
            {startupDiagnostics.recentCompletedTasks.length > 0 ? (
              <Text style={styles.line}>
                Last startup:{" "}
                {
                  startupDiagnostics.recentCompletedTasks[
                    startupDiagnostics.recentCompletedTasks.length - 1
                  ]?.name
                }
              </Text>
            ) : null}
            {playbackDiagnostics.queueInvalidationWarnings > 0 ? (
              <Text style={styles.warning}>
                Queue churn: {playbackDiagnostics.queueInvalidationWarnings}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.hint}>Tap to expand</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default memo(function PerformanceOverlay() {
  if (typeof __DEV__ !== "undefined" && !__DEV__) {
    return null;
  }

  return <PerformanceOverlayPanel />;
});

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 52,
    right: 10,
    zIndex: 9999,
    elevation: 20,
  },
  panel: {
    maxWidth: 230,
    backgroundColor: "rgba(8,8,12,0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,0,51,0.35)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  panelExpanded: {
    maxWidth: 260,
  },
  title: {
    color: "#ff0033",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  line: {
    color: "#f5f5f5",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
  },
  warning: {
    color: "#ffcc66",
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  hint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 9,
    marginTop: 2,
  },
});

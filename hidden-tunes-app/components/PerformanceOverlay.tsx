import { memo, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  getLastScreenSnapshot,
  getPerformanceDiagnostics,
  logPerformanceDiagnosticsOverlay,
} from "../utils/performanceLogs";
import { getImagePrefetchStatus } from "../utils/imagePreloader";
import { getPlaybackRenderDiagnostics } from "../utils/playbackRenderDiagnostics";
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
  const lastScreen = getLastScreenSnapshot();
  const prefetch = getImagePrefetchStatus();
  const topRenderCounts = Object.entries(renderDiagnostics.rerenderCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4);
  const topPlaybackSubscribers = Object.entries(
    playbackDiagnostics.playbackSubscriberRenders
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3);

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.panel, expanded && styles.panelExpanded]}
        onPress={() => setExpanded((current) => !current)}
      >
        <Text style={styles.title}>HT Perf</Text>

        <Text style={styles.line}>
          Screen: {lastScreen?.screen || "—"} ({lastScreen?.readyMs ?? "—"}ms)
        </Text>
        <Text style={styles.line}>
          Cache: {lastScreen?.cache || "—"} ({diagnostics.cacheHitRate}% hit)
        </Text>
        <Text style={styles.line}>
          Startup cache: {diagnostics.startupFirstCachedMs ?? "—"}ms
        </Text>
        <Text style={styles.line}>Items: {lastScreen?.itemCount ?? 0}</Text>

        {expanded ? (
          <>
            <Text style={styles.line}>
              Startup API: {diagnostics.startupFirstApiMs ?? "—"}ms
            </Text>
            <Text style={styles.line}>
              Restore: {diagnostics.startupPlaybackRestoreMs ?? "—"}ms
            </Text>
            <Text style={styles.line}>
              Startup tasks: {diagnostics.startupCompletedTasks} done /{" "}
              {diagnostics.startupScheduledTasks} pending
            </Text>
            <Text style={styles.line}>
              Avg ready: {diagnostics.averageScreenReadyMs}ms
            </Text>
            <Text style={styles.line}>
              Avg refresh: {diagnostics.averageApiRefreshMs}ms
            </Text>
            <Text style={styles.line}>
              Prefetch: {prefetch.paused ? "paused" : "active"} (
              {prefetch.loadedCount})
            </Text>
            <Text style={styles.line}>
              Artwork fails: {diagnostics.artworkFailures}
            </Text>
            <Text style={styles.line}>
              Render samples: {diagnostics.renderRerenderSamples} /{" "}
              {diagnostics.renderTrackedComponents} comps
            </Text>
            <Text style={styles.line}>
              Playback ticks/min: {diagnostics.playbackProgressUpdatesPerMinute}
            </Text>
            <Text style={styles.line}>
              Playback subs: {diagnostics.playbackSubscriberRenders}
            </Text>
            {diagnostics.queueInvalidationWarnings > 0 ? (
              <Text style={styles.warning}>
                Queue churn: {diagnostics.queueInvalidationWarnings}
              </Text>
            ) : null}
            {topRenderCounts.map(([name, count]) => (
              <Text key={name} style={styles.line}>
                {name}: {count}
              </Text>
            ))}
            {topPlaybackSubscribers.map(([name, count]) => (
              <Text key={`pb-${name}`} style={styles.line}>
                pb:{name}: {count}
              </Text>
            ))}
            {startupDiagnostics.recentCompletedTasks.length > 0 ? (
              <Text style={styles.line}>
                Last task:{" "}
                {
                  startupDiagnostics.recentCompletedTasks[
                    startupDiagnostics.recentCompletedTasks.length - 1
                  ]?.name
                }
              </Text>
            ) : null}
            {diagnostics.slowEndpointWarnings > 0 ? (
              <Text style={styles.warning}>
                Slow endpoints: {diagnostics.slowEndpointWarnings}
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
    maxWidth: 220,
    backgroundColor: "rgba(8,8,12,0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,0,51,0.35)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  panelExpanded: {
    maxWidth: 250,
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
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    marginTop: 2,
  },
  hint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 9,
    marginTop: 2,
  },
});

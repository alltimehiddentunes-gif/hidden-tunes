import { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import WebView from "react-native-webview";

import { COLORS, GRADIENTS } from "../constants/theme";

function readRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function buildHlsPlayerHtml(streamUrl: string, title: string) {
  const streamUrlJson = JSON.stringify(streamUrl);
  const titleJson = JSON.stringify(title || "Hidden Tunes TV");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #000;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      video {
        width: 100%;
        height: 100%;
        background: #000;
        object-fit: contain;
      }

      .message {
        position: absolute;
        left: 16px;
        right: 16px;
        bottom: 18px;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.55);
        color: rgba(255, 255, 255, 0.78);
        font-size: 13px;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <video
      id="hiddenTunesTvPlayer"
      controls
      autoplay
      playsinline
      webkit-playsinline
      preload="auto"
    ></video>
    <div class="message">If playback does not start, tap play.</div>
    <script>
      var streamUrl = ${streamUrlJson};
      var title = ${titleJson};
      var video = document.getElementById("hiddenTunesTvPlayer");

      document.title = title;
      video.src = streamUrl;
      video.play().catch(function () {});
    </script>
  </body>
</html>`;
}

export default function TvPlayerScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    title?: string;
    streamUrl?: string;
    sourceType?: string;
  }>();

  const title = readRouteParam(params.title).trim() || "Hidden Tunes TV";
  const streamUrl = readRouteParam(params.streamUrl).trim();
  const sourceType = readRouteParam(params.sourceType).trim() || "hls_stream";
  const html = useMemo(
    () => (streamUrl ? buildHlsPlayerHtml(streamUrl, title) : ""),
    [streamUrl, title]
  );
  const webViewSource = useMemo(
    () => ({ html, baseUrl: "https://hiddentunes.com" as const }),
    [html]
  );

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={26} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>HIDDEN TUNES TV</Text>
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
          </View>
        </View>

        <View style={styles.playerFrame}>
          {streamUrl ? (
            <WebView
              allowsInlineMediaPlayback
              allowsFullscreenVideo
              javaScriptEnabled
              mediaPlaybackRequiresUserAction={false}
              originWhitelist={["*"]}
              source={webViewSource}
              style={styles.webView}
            />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="tv-outline" size={34} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Stream unavailable</Text>
              <Text style={styles.emptyText}>
                This TV station did not return a playable stream. Try another channel.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.details}>
          <View style={styles.badge}>
            <Ionicons name="tv" size={16} color={COLORS.backgroundDeep} />
            <Text style={styles.badgeText}>Now Playing</Text>
          </View>
          <Text numberOfLines={2} style={styles.nowPlayingTitle}>
            {title}
          </Text>
          <Text style={styles.sourceType}>{sourceType.replace(/_/g, " ")}</Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 18,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    paddingBottom: 18,
    paddingTop: 14,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
    marginTop: 4,
  },
  playerFrame: {
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderColor: COLORS.borderSoft,
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
    width: "100%",
  },
  webView: {
    backgroundColor: "#000",
    flex: 1,
  },
  emptyState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0,
    marginTop: 12,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  details: {
    backgroundColor: "rgba(18,7,31,0.68)",
    borderColor: COLORS.borderSoft,
    borderRadius: 28,
    borderWidth: 1,
    marginTop: 28,
    padding: 22,
  },
  badge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeText: {
    color: COLORS.backgroundDeep,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0,
  },
  nowPlayingTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
    marginTop: 18,
  },
  sourceType: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 10,
    textTransform: "capitalize",
  },
});

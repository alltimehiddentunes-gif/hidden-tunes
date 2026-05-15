import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import WebView from "react-native-webview";

import { COLORS, GRADIENTS } from "@/constants/theme";
import { YOUTUBE_CONFIG } from "@/constants/youtube";

const YOUTUBE_HOME_URL = "https://m.youtube.com";

function extractVideoId(value: unknown) {
  const raw = String(value || "").replace("youtube-", "").trim();

  if (!raw) return "";
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const watchId = url.searchParams.get("v") || "";

    if (/^[a-zA-Z0-9_-]{11}$/.test(watchId)) return watchId;

    const shortsMatch = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch?.[1]) return shortsMatch[1];

    const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch?.[1]) return embedMatch[1];

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "").trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {}

  const match = raw.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

function buildSearchUrl(query: string) {
  return `${YOUTUBE_HOME_URL}/results?search_query=${encodeURIComponent(query)}`;
}

function buildChannelUrl() {
  if (YOUTUBE_CONFIG.CHANNEL_ID) {
    return `${YOUTUBE_HOME_URL}/channel/${YOUTUBE_CONFIG.CHANNEL_ID}`;
  }

  return buildSearchUrl("Hidden Tunes music");
}

function isYouTubeUrl(url: string) {
  return (
    url.includes("youtube.com") ||
    url.includes("youtu.be") ||
    url.includes("youtube-nocookie.com")
  );
}

const interceptYouTubeClicksScript = `
  (function () {
    if (window.__hiddenTunesTvClickInterceptor) return true;
    window.__hiddenTunesTvClickInterceptor = true;

    function sendVideo(href) {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "youtube_video_link",
          href: href
        }));
      } catch (error) {}
    }

    function findVideoHref(target) {
      var node = target;

      while (node && node !== document.body) {
        if (node.href) {
          var href = String(node.href);
          if (href.indexOf("/watch") >= 0 || href.indexOf("/shorts/") >= 0 || href.indexOf("youtu.be/") >= 0) {
            return href;
          }
        }

        node = node.parentNode;
      }

      return "";
    }

    document.addEventListener("click", function (event) {
      var href = findVideoHref(event.target);

      if (!href) return;

      event.preventDefault();
      event.stopPropagation();
      sendVideo(href);
    }, true);

    true;
  })();
`;

export default function HiddenTunesTVScreen() {
  const params = useLocalSearchParams();
  const webViewRef = useRef<WebView | null>(null);

  const initialQuery = String(params.q || params.query || "").trim();
  const [query, setQuery] = useState(initialQuery);
  const [webUrl, setWebUrl] = useState(
    initialQuery ? buildSearchUrl(initialQuery) : buildChannelUrl()
  );
  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState(
    initialQuery
      ? `Searching YouTube for "${initialQuery}"`
      : "Official YouTube discovery, no Data API quota"
  );

  const headerLabel = useMemo(() => {
    if (webUrl.includes("/results?")) return "YouTube web search";
    if (webUrl.includes("/channel/")) return "Official channel";
    return "YouTube web discovery";
  }, [webUrl]);

  const openEmbeddedVideo = useCallback((videoId: string, sourceUrl = "") => {
    if (!videoId) return;

    console.log("Hidden Tunes TV opening embedded video:", {
      videoId,
      sourceUrl,
    });

    router.push({
      pathname: "/youtube-player",
      params: {
        id: videoId,
        videoId,
        title: "Hidden Tunes TV",
        artist: "YouTube",
        channelTitle: "YouTube",
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      },
    } as any);
  }, []);

  const submitSearch = useCallback(
    (value = query) => {
      const clean = String(value || "").trim();

      if (!clean) {
        setWebUrl(buildChannelUrl());
        setStatusText("Official YouTube discovery, no Data API quota");
        return;
      }

      const videoId = extractVideoId(clean);

      if (videoId) {
        openEmbeddedVideo(videoId, clean);
        return;
      }

      setWebUrl(buildSearchUrl(clean));
      setStatusText(`Searching YouTube for "${clean}"`);
    },
    [openEmbeddedVideo, query]
  );

  const resetToChannel = useCallback(() => {
    setQuery("");
    setWebUrl(buildChannelUrl());
    setStatusText("Official YouTube discovery, no Data API quota");
  }, []);

  const handleNavigation = useCallback(
    (request: { url: string }) => {
      const requestUrl = String(request.url || "");

      if (!requestUrl) return true;

      if (!isYouTubeUrl(requestUrl)) {
        console.log("Hidden Tunes TV blocked non-YouTube navigation:", requestUrl);
        return false;
      }

      const videoId = extractVideoId(requestUrl);

      if (videoId && /\/(watch|shorts|embed)\//.test(requestUrl) === false) {
        openEmbeddedVideo(videoId, requestUrl);
        return false;
      }

      if (videoId && requestUrl.includes("/watch")) {
        openEmbeddedVideo(videoId, requestUrl);
        return false;
      }

      if (videoId && requestUrl.includes("/shorts/")) {
        openEmbeddedVideo(videoId, requestUrl);
        return false;
      }

      return true;
    },
    [openEmbeddedVideo]
  );

  const handleWebViewMessage = useCallback(
    (event: any) => {
      const rawMessage = String(event.nativeEvent.data || "");

      try {
        const message = JSON.parse(rawMessage);

        if (message.type !== "youtube_video_link") return;

        const videoId = extractVideoId(message.href);

        if (videoId) {
          openEmbeddedVideo(videoId, message.href);
        }
      } catch (error) {
        console.log("Hidden Tunes TV WebView message error:", {
          error,
          rawMessage,
        });
      }
    },
    [openEmbeddedVideo]
  );

  useEffect(() => {
    if (!initialQuery) return;

    setQuery(initialQuery);
    setWebUrl(buildSearchUrl(initialQuery));
    setStatusText(`Searching YouTube for "${initialQuery}"`);
  }, [initialQuery]);

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>NO DATA API QUOTA</Text>
          <Text style={styles.title}>Hidden Tunes TV</Text>
          <Text style={styles.subtitle}>
            Browse YouTube web search inside Hidden Tunes, then play with the
            official embedded player.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.iconButton}
          activeOpacity={0.85}
          onPress={resetToChannel}
        >
          <Ionicons name="home" size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={19} color={COLORS.cyan} />

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search YouTube or paste a video link..."
          placeholderTextColor={COLORS.textDim}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.searchInput}
          onSubmitEditing={() => submitSearch(query)}
        />

        {query.length > 0 ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              setQuery("");
              resetToChannel();
            }}
          >
            <Ionicons name="close-circle" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="logo-youtube" size={20} color="#ff0033" />
        )}
      </View>

      <TouchableOpacity
        activeOpacity={0.88}
        style={styles.searchButton}
        onPress={() => submitSearch(query)}
      >
        <Ionicons name="search" size={18} color="#000" />
        <Text style={styles.searchButtonText}>Search YouTube Web</Text>
      </TouchableOpacity>

      <View style={styles.statusRow}>
        <Text numberOfLines={1} style={styles.statusTitle}>
          {headerLabel}
        </Text>
        <Text numberOfLines={1} style={styles.statusText}>
          {statusText}
        </Text>
      </View>

      <View style={styles.browserFrame}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading YouTube...</Text>
          </View>
        )}

        <WebView
          ref={webViewRef}
          key={webUrl}
          source={{ uri: webUrl }}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          mixedContentMode="always"
          originWhitelist={["*"]}
          injectedJavaScript={interceptYouTubeClicksScript}
          injectedJavaScriptBeforeContentLoaded={interceptYouTubeClicksScript}
          onMessage={handleWebViewMessage}
          userAgent="Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          onShouldStartLoadWithRequest={handleNavigation}
          onLoadStart={() => {
            setLoading(true);
            console.log("Hidden Tunes TV WebView loading:", webUrl);
          }}
          onLoadEnd={() => {
            setLoading(false);
            console.log("Hidden Tunes TV WebView loaded:", webUrl);
          }}
          onError={(event) => {
            setLoading(false);
            console.log("Hidden Tunes TV WebView error:", event.nativeEvent);
            setStatusText("YouTube web discovery failed to load. Try again.");
          }}
          onHttpError={(event) => {
            console.log("Hidden Tunes TV WebView HTTP error:", event.nativeEvent);
            setStatusText("YouTube returned an HTTP error. Try another search.");
          }}
          style={styles.webview}
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  headerCopy: {
    flex: 1,
    paddingRight: 14,
  },

  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 6,
  },

  title: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: "900",
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    fontWeight: "700",
  },

  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  searchBox: {
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 17,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.24)",
    flexDirection: "row",
    alignItems: "center",
  },

  searchInput: {
    flex: 1,
    color: COLORS.text,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "800",
  },

  searchButton: {
    minHeight: 46,
    borderRadius: 23,
    marginTop: 12,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  searchButtonText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "900",
  },

  statusRow: {
    marginTop: 14,
    marginBottom: 10,
  },

  statusTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },

  statusText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  browserFrame: {
    flex: 1,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 116,
  },

  webview: {
    flex: 1,
    backgroundColor: "#000",
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: COLORS.textMuted,
    marginTop: 10,
    fontSize: 12,
    fontWeight: "800",
  },
});

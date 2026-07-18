import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { COLORS } from "@/constants/theme";
import { getTvChannelById } from "@/data/tvChannelSeedCatalog";
import { getTvSessionController } from "@/services/tv/tvSessionController";

/**
 * Full-player route presentation of the single TV session owner.
 * Does not mount a WebView ÔÇö video lives in TvPlaybackProvider / TvPlayerHost.
 */
export default function TvPlayerScreen() {
  const params = useLocalSearchParams();
  const paramsRef = useRef(params);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    const controller = getTvSessionController();
    const snapshot = paramsRef.current;

    const channelId = String(snapshot.channelId || snapshot.id || "").trim();
    const streamUrl = String(snapshot.streamUrl || "").trim();
    const title = String(
      snapshot.title || snapshot.name || "Hidden Tunes TV"
    ).trim();
    const logo = String(snapshot.logo || snapshot.logoUrl || "").trim();
    const sourceType = String(
      snapshot.sourceType || snapshot.streamType || "hls_stream"
    ).trim();

    const bootstrap = async () => {
      if (bootstrappedRef.current) {
        controller?.setPresentationMode("fullPlayer");
        return;
      }
      bootstrappedRef.current = true;

      const activeId = controller?.getActiveItemId?.() || null;
      const normalizedChannelId = channelId.replace(/^backend-/, "");

      if (controller?.isSessionActive()) {
        if (
          !channelId &&
          !streamUrl
        ) {
          controller.setPresentationMode("fullPlayer");
          return;
        }
        if (
          activeId &&
          (activeId === channelId || activeId === normalizedChannelId)
        ) {
          controller.setPresentationMode("fullPlayer");
          return;
        }
        // Session already started by openTvChannelPlayer / openHiddenTunesTvStation
        // before navigation ÔÇö only switch presentation.
        if (activeId) {
          controller.setPresentationMode("fullPlayer");
          return;
        }
      }

      if (streamUrl) {
        const itemId = normalizedChannelId || `stream-${title}`;
        await controller?.startResolvedSession({
          item: {
            id: itemId,
            title,
            logo: logo || null,
            thumbnail_url: logo || null,
            categories: [],
            source_type: sourceType,
          },
          playback: {
            id: itemId,
            source_type: sourceType || "hls_stream",
            source_id: "",
            stream_url: streamUrl,
            embed_url: null,
          },
          presentation: "fullPlayer",
        });
        return;
      }

      if (channelId) {
        const seed = getTvChannelById(channelId);
        if (seed) {
          await controller?.startSeedSession({
            channel: seed,
            sectionId: "all",
            channelIds: [seed.id],
            presentation: "fullPlayer",
          });
        }
      }
    };

    void bootstrap();

    return () => {
      const active = getTvSessionController();
      if (active?.isSessionActive()) {
        active.setPresentationMode("floating");
      }
    };
  }, []);

  return (
    <View style={styles.placeholder}>
      <ActivityIndicator color={COLORS.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
});

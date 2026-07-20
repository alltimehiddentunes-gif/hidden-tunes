import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { getTvChannelById } from "@/data/tvChannelSeedCatalog";
import { getTvSessionController } from "@/services/tv/tvSessionController";
import { shouldAutoFloatOnRouteBlur } from "@/services/tv/tvPipTransition";
import { setTvPlayerRouteFocused } from "@/services/tv/tvPlayerNavigation";

function logPipRestore(event: string, detail?: string) {
  if (!__DEV__) return;
  const safe = detail ? ` ${detail}` : "";
  console.log(`[HTTvPiPRestore] ${event}${safe}`);
}

/**
 * Full-player route presentation of the single TV session owner.
 * Does not mount video — that lives in TvPlaybackProvider / TvPlayerHost.
 * This shell must never paint a blank/black frame during PiP restore:
 * the persistent host already owns the visible player.
 */
export default function TvPlayerScreen() {
  const params = useLocalSearchParams();
  const paramsRef = useRef(params);
  const bootstrappedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      logPipRestore("AppState", `${previous} → ${next}`);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  // While this route is focused, keep the session in expanded fullPlayer mode.
  // Background/Home blur must NOT minimize — that detaches/resizes VideoView
  // before iOS automatic PiP can capture the native layer (one-swipe bug).
  useFocusEffect(
    useCallback(() => {
      setTvPlayerRouteFocused(true);
      logPipRestore("route", "focused");
      const controller = getTvSessionController();
      if (controller?.isSessionActive()) {
        controller.setPresentationMode("fullPlayer");
        logPipRestore("presentation", "fullPlayer (focus)");
      }

      return () => {
        const appState = appStateRef.current;
        const allowFloat = shouldAutoFloatOnRouteBlur({
          appState,
          pipTransitionState:
            appState === "inactive" || appState === "background"
              ? "requesting"
              : "idle",
          sessionActive: true,
        });

        if (!allowFloat) {
          // Keep route presence true: /tv-player remains the stack entry under PiP.
          // Clearing it made restore call replace() and flash the empty shell.
          logPipRestore(
            "auto-float suppressed",
            `appState=${appState} (keep route presence + VideoView)`
          );
          return;
        }

        setTvPlayerRouteFocused(false);
        logPipRestore("route", "blur (navigated away)");

        // True in-app navigation away (Back / replace) while app is active.
        queueMicrotask(() => {
          if (AppState.currentState !== "active") {
            logPipRestore(
              "auto-float suppressed",
              "app left active before microtask"
            );
            return;
          }
          const active = getTvSessionController();
          if (!active?.isSessionActive()) return;
          if (active.getPresentationMode() !== "fullPlayer") return;
          logPipRestore("presentation", "floating (navigated away)");
          active.setPresentationMode("floating");
        });
      };
    }, [])
  );

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
        if (!channelId && !streamUrl) {
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
        // before navigation — only switch presentation.
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
  }, []);

  // Non-painting shell: TvPlayerHost (absolute overlay) is the real UI.
  // pointerEvents none so the host receives touches; no painted background.
  return <View style={styles.shell} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});

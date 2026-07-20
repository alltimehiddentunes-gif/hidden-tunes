import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

import {
  canUseTvPiP,
  classifyTvPipRejection,
  resolveTvPipUserMessage,
  shouldAcceptTvPiPStart,
  type TvPipPlayerStatus,
} from "../../services/tv/tvPipEligibility";

export type TvNativeVideoHandle = {
  play: () => void;
  pause: () => void;
  unload: () => void;
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  startPictureInPicture: () => Promise<{
    ok: boolean;
    message?: string;
  }>;
  stopPictureInPicture: () => Promise<void>;
};

type TvNativeVideoSurfaceProps = {
  streamUrl: string;
  /**
   * When true, show the same on-video native chrome Metro uses
   * (Fullscreen ↗, on-video PiP, transport). Keep app chrome below separately.
   */
  nativeControls?: boolean;
  /**
   * Enable automatic system PiP when the app backgrounds while this
   * native TV surface is active with a playable video.
   */
  autoPictureInPicture?: boolean;
  onPlaying: () => void;
  onPaused: () => void;
  onError: () => void;
  onPictureInPictureStart?: () => void;
  onPictureInPictureStop?: () => void;
};

/**
 * Single expo-video instance for HLS / direct MP4 TV streams.
 * Owned by the TV session host - never mounted alongside the TV WebView.
 * System PiP reuses this same player instance — never a second hidden player.
 */
const TvNativeVideoSurface = forwardRef<
  TvNativeVideoHandle,
  TvNativeVideoSurfaceProps
>(function TvNativeVideoSurface(
  {
    streamUrl,
    nativeControls = false,
    autoPictureInPicture = false,
    onPlaying,
    onPaused,
    onError,
    onPictureInPictureStart,
    onPictureInPictureStop,
  },
  ref
) {
  const loadGenerationRef = useRef(0);
  const reportedPlayingRef = useRef(false);
  const videoViewRef = useRef<VideoView | null>(null);
  const pipInFlightRef = useRef(false);
  const disposedRef = useRef(false);
  const playerStatusRef = useRef<TvPipPlayerStatus>("idle");
  const onPlayingRef = useRef(onPlaying);
  const onPausedRef = useRef(onPaused);
  const onErrorRef = useRef(onError);
  const onPipStartRef = useRef(onPictureInPictureStart);
  const onPipStopRef = useRef(onPictureInPictureStop);
  onPlayingRef.current = onPlaying;
  onPausedRef.current = onPaused;
  onErrorRef.current = onError;
  onPipStartRef.current = onPictureInPictureStart;
  onPipStopRef.current = onPictureInPictureStop;

  const player = useVideoPlayer(null, (instance) => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 0.5;
    instance.audioMixingMode = "doNotMix";
    // TV/video only — requires supportsBackgroundPlayback in the expo-video plugin.
    instance.staysActiveInBackground = true;
  });

  const emitPlaying = () => {
    if (reportedPlayingRef.current) return;
    reportedPlayingRef.current = true;
    playerStatusRef.current = "playing";
    onPlayingRef.current();
  };

  const logPip = (event: string, detail?: string) => {
    if (!__DEV__) return;
    const safe = detail ? ` ${detail}` : "";
    console.log(`[HTTvPiP] ${event}${safe}`);
  };

  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        try {
          player.play();
          if (player.playing) emitPlaying();
        } catch {
          onErrorRef.current();
        }
      },
      pause: () => {
        try {
          player.pause();
        } catch {
          // Best-effort.
        }
      },
      unload: () => {
        loadGenerationRef.current += 1;
        reportedPlayingRef.current = false;
        playerStatusRef.current = "idle";
        disposedRef.current = true;
        try {
          player.pause();
          player.replace(null);
        } catch {
          // Best-effort release before unmount.
        }
      },
      enterFullscreen: async () => {
        try {
          await videoViewRef.current?.enterFullscreen();
        } catch {
          // Best-effort — unsupported surfaces fail silently.
        }
      },
      exitFullscreen: async () => {
        try {
          await videoViewRef.current?.exitFullscreen();
        } catch {
          // Best-effort.
        }
      },
      startPictureInPicture: async () => {
        const status = playerStatusRef.current;
        const eligible = canUseTvPiP({
          platform: Platform.OS,
          sourceUri: streamUrl,
          surface: "native",
          playerStatus: status,
          isNativeSurfaceMounted: Boolean(videoViewRef.current),
          sessionActive: !disposedRef.current,
          hasFatalError: status === "error",
        });
        const gate = shouldAcceptTvPiPStart({
          inFlight: pipInFlightRef.current,
          sessionActive: !disposedRef.current,
          eligible,
          disposed: disposedRef.current || !videoViewRef.current,
        });
        if (!gate.accept) {
          logPip("start ignored", gate.reason);
          return {
            ok: false,
            message: resolveTvPipUserMessage(gate.reason || "not_ready"),
          };
        }

        pipInFlightRef.current = true;
        logPip("start requested");
        try {
          await videoViewRef.current?.startPictureInPicture();
          logPip("start succeeded");
          return { ok: true };
        } catch (error) {
          const kind = classifyTvPipRejection(error);
          logPip("start failed", kind);
          return {
            ok: false,
            message: resolveTvPipUserMessage(kind),
          };
        } finally {
          pipInFlightRef.current = false;
        }
      },
      stopPictureInPicture: async () => {
        try {
          await videoViewRef.current?.stopPictureInPicture();
        } catch {
          // Best-effort.
        }
      },
    }),
    [player, streamUrl]
  );

  // Attach status listeners before load/play so the first playing/ready event is never missed.
  useEffect(() => {
    disposedRef.current = false;
    reportedPlayingRef.current = false;
    playerStatusRef.current = "loading";

    const playingSub = player.addListener("playingChange", ({ isPlaying }) => {
      if (isPlaying) emitPlaying();
      else {
        playerStatusRef.current = "paused";
        onPausedRef.current();
      }
    });

    const statusSub = player.addListener("statusChange", ({ status, error }) => {
      if (status === "error" || error) {
        playerStatusRef.current = "error";
        onErrorRef.current();
        return;
      }
      // readyToPlay means the surface can render — clear preparing immediately.
      if (status === "readyToPlay") {
        playerStatusRef.current = "readyToPlay";
        try {
          if (!player.playing) player.play();
        } catch {
          // Ignore; playingChange / timeUpdate still cover success.
        }
        emitPlaying();
      } else if (status === "loading") {
        playerStatusRef.current = "loading";
      }
    });

    const timeSub = player.addListener("timeUpdate", ({ currentTime }) => {
      if (currentTime > 0 || player.playing) {
        emitPlaying();
      }
    });

    return () => {
      playingSub.remove();
      statusSub.remove();
      timeSub.remove();
    };
  }, [player, streamUrl]);

  useEffect(() => {
    const generation = ++loadGenerationRef.current;
    reportedPlayingRef.current = false;
    playerStatusRef.current = "loading";
    disposedRef.current = false;
    let cancelled = false;

    const load = async () => {
      try {
        player.pause();
        await player.replaceAsync(streamUrl);
        if (cancelled || generation !== loadGenerationRef.current) {
          return;
        }
        player.play();
        // Sync fallback if playingChange already fired before listeners attached.
        if (player.playing || player.status === "readyToPlay") {
          emitPlaying();
        }
      } catch {
        if (!cancelled && generation === loadGenerationRef.current) {
          playerStatusRef.current = "error";
          onErrorRef.current();
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      try {
        player.pause();
      } catch {
        // Ignore.
      }
    };
  }, [player, streamUrl]);

  useEffect(() => {
    return () => {
      disposedRef.current = true;
    };
  }, []);

  return (
    <View style={styles.fill}>
      <VideoView
        ref={videoViewRef}
        style={styles.fill}
        player={player}
        nativeControls={nativeControls}
        contentFit="contain"
        allowsPictureInPicture
        startsPictureInPictureAutomatically={Boolean(autoPictureInPicture)}
        onPictureInPictureStart={() => {
          logPip("pip active");
          onPipStartRef.current?.();
        }}
        onPictureInPictureStop={() => {
          logPip("pip stopped");
          onPipStopRef.current?.();
        }}
      />
    </View>
  );
});

export default TvNativeVideoSurface;

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: "#000",
  },
});

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

export type TvNativeVideoHandle = {
  play: () => void;
  pause: () => void;
  unload: () => void;
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
};

type TvNativeVideoSurfaceProps = {
  streamUrl: string;
  onPlaying: () => void;
  onPaused: () => void;
  onError: () => void;
};

/**
 * Single expo-video instance for HLS / direct MP4 TV streams.
 * Owned by the TV session host - never mounted alongside the TV WebView.
 */
const TvNativeVideoSurface = forwardRef<
  TvNativeVideoHandle,
  TvNativeVideoSurfaceProps
>(function TvNativeVideoSurface(
  { streamUrl, onPlaying, onPaused, onError },
  ref
) {
  const loadGenerationRef = useRef(0);
  const reportedPlayingRef = useRef(false);
  const videoViewRef = useRef<VideoView | null>(null);
  const onPlayingRef = useRef(onPlaying);
  const onPausedRef = useRef(onPaused);
  const onErrorRef = useRef(onError);
  onPlayingRef.current = onPlaying;
  onPausedRef.current = onPaused;
  onErrorRef.current = onError;

  const player = useVideoPlayer(null, (instance) => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 0.5;
    instance.audioMixingMode = "doNotMix";
  });

  const emitPlaying = () => {
    if (reportedPlayingRef.current) return;
    reportedPlayingRef.current = true;
    onPlayingRef.current();
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
    }),
    [player]
  );

  // Attach status listeners before load/play so the first playing/ready event is never missed.
  useEffect(() => {
    reportedPlayingRef.current = false;

    const playingSub = player.addListener("playingChange", ({ isPlaying }) => {
      if (isPlaying) emitPlaying();
      else onPausedRef.current();
    });

    const statusSub = player.addListener("statusChange", ({ status, error }) => {
      if (status === "error" || error) {
        onErrorRef.current();
        return;
      }
      // readyToPlay means the surface can render — clear preparing immediately.
      if (status === "readyToPlay") {
        try {
          if (!player.playing) player.play();
        } catch {
          // Ignore; playingChange / timeUpdate still cover success.
        }
        emitPlaying();
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

  return (
    <View style={styles.fill}>
      <VideoView
        ref={videoViewRef}
        style={styles.fill}
        player={player}
        nativeControls={false}
        contentFit="contain"
        allowsPictureInPicture={false}
        startsPictureInPictureAutomatically={false}
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

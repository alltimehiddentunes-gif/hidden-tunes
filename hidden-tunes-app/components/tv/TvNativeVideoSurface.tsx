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
};

type TvNativeVideoSurfaceProps = {
  streamUrl: string;
  onPlaying: () => void;
  onPaused: () => void;
  onError: () => void;
};

/**
 * Single expo-video instance for HLS / direct MP4 TV streams.
 * Owned by the TV session host — never mounted alongside the TV WebView.
 */
const TvNativeVideoSurface = forwardRef<
  TvNativeVideoHandle,
  TvNativeVideoSurfaceProps
>(function TvNativeVideoSurface(
  { streamUrl, onPlaying, onPaused, onError },
  ref
) {
  const loadGenerationRef = useRef(0);
  const player = useVideoPlayer(null, (instance) => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 0;
    instance.audioMixingMode = "doNotMix";
  });

  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        try {
          player.play();
        } catch {
          onError();
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
        try {
          player.pause();
          player.replace(null);
        } catch {
          // Best-effort release before unmount.
        }
      },
    }),
    [onError, player]
  );

  useEffect(() => {
    const generation = ++loadGenerationRef.current;
    let cancelled = false;

    const load = async () => {
      try {
        player.pause();
        await player.replaceAsync(streamUrl);
        if (cancelled || generation !== loadGenerationRef.current) {
          return;
        }
        player.play();
      } catch {
        if (!cancelled && generation === loadGenerationRef.current) {
          onError();
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
  }, [onError, player, streamUrl]);

  useEffect(() => {
    const playingSub = player.addListener("playingChange", ({ isPlaying }) => {
      if (isPlaying) onPlaying();
      else onPaused();
    });
    const statusSub = player.addListener("statusChange", ({ status, error }) => {
      if (status === "error" || error) {
        onError();
      }
    });

    return () => {
      playingSub.remove();
      statusSub.remove();
    };
  }, [onError, onPaused, onPlaying, player]);

  return (
    <View style={styles.fill}>
      <VideoView
        style={styles.fill}
        player={player}
        nativeControls={false}
        contentFit="contain"
        allowsFullscreen={false}
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

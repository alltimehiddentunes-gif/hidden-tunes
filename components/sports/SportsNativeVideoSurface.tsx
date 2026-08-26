import { memo, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView, type VideoSource } from "expo-video";

type SportsNativeVideoSurfaceProps = {
  manifestUrl: string;
  playbackKind: "hls" | "dash" | "progressive";
  headers?: Record<string, string>;
  title: string;
  onPlaybackError?: () => void;
};

function SportsNativeVideoSurface({
  manifestUrl,
  playbackKind,
  headers,
  title,
  onPlaybackError,
}: SportsNativeVideoSurfaceProps) {
  const source = useMemo<VideoSource>(
    () => ({
      uri: manifestUrl,
      contentType: playbackKind,
      headers,
      useCaching: false,
      metadata: { title, artist: "Hidden Tunes Sports" },
    }),
    [headers, manifestUrl, playbackKind, title]
  );

  const player = useVideoPlayer(source, (instance) => {
    instance.audioMixingMode = "doNotMix";
    instance.keepScreenOnWhilePlaying = true;
    instance.loop = false;
    instance.play();
  });
  const statusEvent = useEvent(player, "statusChange", {
    status: player.status,
  });
  const handledErrorRef = useRef(false);

  useEffect(() => {
    if (statusEvent.status !== "error" || handledErrorRef.current) return;
    handledErrorRef.current = true;
    onPlaybackError?.();
  }, [onPlaybackError, statusEvent.status]);

  return (
    <View style={styles.root} testID="sports-native-video-surface">
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true, orientation: "landscape" }}
        allowsPictureInPicture
        startsPictureInPictureAutomatically={false}
      />
    </View>
  );
}

export default memo(SportsNativeVideoSurface);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  video: { flex: 1, backgroundColor: "#000" },
});

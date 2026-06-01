import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { usePathname } from "expo-router";

import EmotionalFlowNowPlayingHint from "../components/EmotionalFlowNowPlayingHint";
import { usePlayerNowPlaying } from "../context/PlayerContext";
import { useEmotionalFlowSettings } from "../state/useEmotionalFlowSettings";
import { useEmotionalQueueSnapshot } from "../state/useEmotionalQueueSnapshot";
import { appSongToTrack } from "../utils/emotionalQueueTrackBridge";
import {
  buildEmotionalTransitionContext,
  explainNowPlayingFlowHint,
} from "../utils/explainEmotionalTransition";
import { getPlayerNowPlayingHintPosition } from "../utils/emotionalFlowHintLayout";

function PlayerScreenEmotionalFlowHints() {
  const pathname = usePathname();
  const { currentSong } = usePlayerNowPlaying();
  const settings = useEmotionalFlowSettings();
  const { emotionalQueue, queueIndex } = useEmotionalQueueSnapshot();
  const onPlayerScreen = pathname.includes("player");

  const hint = useMemo(() => {
    if (!currentSong || !settings.emotionalFlowEnabled) {
      return null;
    }

    const currentTrack = appSongToTrack(currentSong);
    const previousTrack =
      emotionalQueue.length > 1 && queueIndex > 0
        ? emotionalQueue[queueIndex - 1]
        : null;

    return explainNowPlayingFlowHint(
      currentTrack,
      buildEmotionalTransitionContext(settings),
      previousTrack
    );
  }, [
    currentSong,
    emotionalQueue,
    queueIndex,
    settings,
  ]);

  if (!onPlayerScreen || !hint) {
    return null;
  }

  const position = getPlayerNowPlayingHintPosition();

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <EmotionalFlowNowPlayingHint
        hint={hint}
        style={[
          styles.hint,
          {
            top: position.top,
            left: position.left,
            right: position.right,
          },
        ]}
      />
    </View>
  );
}

export default memo(PlayerScreenEmotionalFlowHints);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    zIndex: 14,
  },
  hint: {
    position: "absolute",
  },
});

import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { usePathname } from "expo-router";

import EmotionalFlowNextReason from "../components/EmotionalFlowNextReason";
import { usePlayerState } from "../context/PlayerContext";
import { useEmotionalFlowSettings } from "../state/useEmotionalFlowSettings";
import { useEmotionalQueueSnapshot } from "../state/useEmotionalQueueSnapshot";
import type { Track } from "../types/music";
import { appSongToTrack } from "../utils/emotionalQueueTrackBridge";
import {
  buildEmotionalTransitionContext,
  explainEmotionalTransition,
} from "../utils/explainEmotionalTransition";
import {
  getQueueHintTopForIndex,
  QUEUE_HINT_LEFT,
} from "../utils/emotionalFlowHintLayout";

type QueueTransitionHint = {
  key: string;
  reason: string;
  top: number;
};

function QueueScreenEmotionalFlowHints() {
  const pathname = usePathname();
  const settings = useEmotionalFlowSettings();
  const { emotionalQueue, queueIndex } = useEmotionalQueueSnapshot();
  const { currentSong, activeQueue, activeQueueIndex } = usePlayerState();
  const onQueueScreen = pathname.includes("queue");

  const hints = useMemo(() => {
    if (!settings.emotionalFlowEnabled) {
      return [] as QueueTransitionHint[];
    }

    const ctx = buildEmotionalTransitionContext(settings);
    const items: QueueTransitionHint[] = [];

    if (emotionalQueue.length > 1) {
      for (let index = queueIndex + 1; index < emotionalQueue.length; index += 1) {
        const fromTrack = emotionalQueue[index - 1];
        const toTrack = emotionalQueue[index];

        if (!fromTrack || !toTrack) {
          continue;
        }

        items.push({
          key: `emotional-${toTrack.id}-${index}`,
          reason: explainEmotionalTransition(fromTrack, toTrack, ctx),
          top: getQueueHintTopForIndex(index - queueIndex - 1),
        });
      }

      if (items.length) {
        return items.slice(0, 8);
      }
    }

    const queueTracks = (activeQueue ?? []).map((song) => appSongToTrack(song));
    if (!queueTracks.length) {
      return items;
    }

    const nowPlayingTrack = currentSong
      ? appSongToTrack(currentSong)
      : queueTracks[Math.max(activeQueueIndex, 0)] ?? null;

    const upNextTracks = queueTracks.filter((track, index) => {
      if (!nowPlayingTrack) {
        return index > activeQueueIndex;
      }

      if (String(track.id) === String(nowPlayingTrack.id)) {
        return false;
      }

      return index > activeQueueIndex;
    });

    let fromTrack: Track | null = nowPlayingTrack;

    upNextTracks.forEach((toTrack, index) => {
      if (!fromTrack) {
        return;
      }

      items.push({
        key: `queue-${toTrack.id}-${index}`,
        reason: explainEmotionalTransition(fromTrack, toTrack, ctx),
        top: getQueueHintTopForIndex(index),
      });

      fromTrack = toTrack;
    });

    return items.slice(0, 8);
  }, [
    activeQueue,
    activeQueueIndex,
    currentSong,
    emotionalQueue,
    queueIndex,
    settings,
  ]);

  if (!onQueueScreen || hints.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {hints.map((entry) => (
        <EmotionalFlowNextReason
          key={entry.key}
          reason={entry.reason}
          style={[
            styles.hint,
            {
              top: entry.top,
              left: QUEUE_HINT_LEFT,
              right: 72,
            },
          ]}
        />
      ))}
    </View>
  );
}

export default memo(QueueScreenEmotionalFlowHints);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
  },
  hint: {
    position: "absolute",
  },
});

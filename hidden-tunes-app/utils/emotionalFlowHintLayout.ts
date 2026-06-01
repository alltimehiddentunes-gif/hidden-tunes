import { Dimensions } from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;

export const PLAYER_ART_SIZE = Math.round(
  Math.min(300, Math.max(260, SCREEN_WIDTH * 0.72))
);

export const QUEUE_ROW_HEIGHT = 110;
export const QUEUE_HINT_LEFT = 108;
export const QUEUE_SCREEN_PADDING_TOP = 60;
export const QUEUE_HEADER_ROW_HEIGHT = 68;

/** Approximate FlatList header height when the now-playing card is visible. */
export const QUEUE_LIST_HEADER_WITH_NOW_PLAYING = 548;

export function getPlayerNowPlayingHintPosition() {
  const songInfoTop =
    52 + 44 + 12 + PLAYER_ART_SIZE + 10 + 4 + 2;

  return {
    top: songInfoTop + 31,
    left: 24,
    right: 92,
  };
}

export function getPlayerIdentityHintPosition() {
  const nowPlayingHint = getPlayerNowPlayingHintPosition();

  return {
    top: nowPlayingHint.top + 14,
    left: nowPlayingHint.left,
    right: nowPlayingHint.right,
  };
}

export function getQueueIdentityHintPosition() {
  return {
    top:
      QUEUE_SCREEN_PADDING_TOP +
      QUEUE_HEADER_ROW_HEIGHT +
      QUEUE_LIST_HEADER_WITH_NOW_PLAYING -
      22,
    left: 20,
    right: 20,
  };
}

export function getPlayerEngineDashboardPosition() {
  return {
    top: 94,
    right: 18,
    left: 120,
  };
}

export function getQueueEngineDashboardPosition() {
  return {
    top: QUEUE_SCREEN_PADDING_TOP + QUEUE_HEADER_ROW_HEIGHT + 8,
    right: 18,
    left: 120,
  };
}

export function getQueueHintTopForIndex(index: number) {
  return (
    QUEUE_SCREEN_PADDING_TOP +
    QUEUE_HEADER_ROW_HEIGHT +
    QUEUE_LIST_HEADER_WITH_NOW_PLAYING +
    index * QUEUE_ROW_HEIGHT +
    78
  );
}

import { usePlayerActions } from "../context/PlayerContext";

export function useAudiobookPlaybackActions() {
  const { playSong, seekTo } = usePlayerActions();
  return { playSong, seekTo };
}

import type { AppSong } from "../../context/PlayerContext";
import type { NativeQueueMode, PlaybackRouterDeps } from "./playbackRouter";

export async function routeMusicPlayback(
  song: AppSong,
  deps: Pick<PlaybackRouterDeps, "playSong">,
  queue?: AppSong[],
  index?: number
) {
  await deps.playSong(song, queue, index, "standard" satisfies NativeQueueMode);
}

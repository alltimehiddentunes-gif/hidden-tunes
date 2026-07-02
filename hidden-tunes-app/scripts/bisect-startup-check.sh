#!/usr/bin/env bash
set -eu
file_at_commit() { git show "$1:$2" 2>/dev/null; }
commit_has_file() { git cat-file -e "$1:$2" 2>/dev/null; }
check_playback_mode_startup() {
  local commit="$1"
  if ! commit_has_file "$commit" "hidden-tunes-app/utils/playbackMode.ts"; then return 0; fi
  local mode_src; mode_src="$(file_at_commit "$commit" "hidden-tunes-app/utils/playbackMode.ts")"
  if echo "$mode_src" | grep -q 'from "./playbackSongIdentity"'; then return 0; fi
  if echo "$mode_src" | grep -q 'from "../services/playback/playbackRouter"'; then
    for path in hidden-tunes-app/services/playback/playbackRouter.ts hidden-tunes-app/services/playback/podcastPlaybackAdapter.ts hidden-tunes-app/services/playback/radioPlaybackAdapter.ts hidden-tunes-app/services/playback/videoPlaybackAdapter.ts hidden-tunes-app/types/media.ts hidden-tunes-app/types/podcast.ts hidden-tunes-app/types/radio.ts hidden-tunes-app/types/video.ts; do
      if ! commit_has_file "$commit" "$path"; then echo "bisect-startup: missing $path"; return 1; fi
    done
    echo "bisect-startup: playbackMode imports playbackRouter"; return 1
  fi
  return 0
}
check_mini_player_startup() {
  local commit="$1"
  if ! commit_has_file "$commit" "hidden-tunes-app/components/MiniPlayer.tsx"; then return 0; fi
  local mini_src; mini_src="$(file_at_commit "$commit" "hidden-tunes-app/components/MiniPlayer.tsx")"
  if echo "$mini_src" | grep -q 'from "../services/playback/playbackRouter"'; then echo "bisect-startup: MiniPlayer imports playbackRouter"; return 1; fi
  return 0
}
commit="${1:-HEAD}"
if check_playback_mode_startup "$commit" && check_mini_player_startup "$commit"; then echo "bisect-startup: GOOD $commit"; exit 0; fi
echo "bisect-startup: BAD $commit"; exit 1

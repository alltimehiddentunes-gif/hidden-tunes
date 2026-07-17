import assert from "node:assert/strict";

import {
  mapLecturePlayResponse,
  selectPrimaryLectureLesson,
} from "../services/lectureCatalogApi";
import {
  beginLecturePlayback,
  getLecturePlaybackInflightId,
  isLecturePlaybackInflight,
} from "../services/lectures/lecturePlaybackGuard";
import {
  buildLectureCanonicalId,
  buildLectureSessionSongs,
  isLectureQueueSong,
  isLectureVideoItem,
  lectureItemToAppSong,
  parseLectureCanonicalId,
  toLectureCanonicalLabel,
  type LecturePlayableItem,
} from "../services/playback/lecturePlaybackAdapter";
import { routeLecturePlayback } from "../services/playback/lecturePlaybackRouter";
import {
  isPodcastEpisodeSong,
  podcastEpisodeToAppSong,
} from "../services/playback/podcastPlaybackAdapter";
import {
  isRadioStreamSong,
  radioStationToAppSong,
} from "../services/playback/radioPlaybackAdapter";
import { isBoundedQueuePlayback } from "../utils/playbackMode";

function makePlayable(
  overrides: Partial<LecturePlayableItem> = {}
): LecturePlayableItem {
  return {
    lectureId: "lec-1",
    itemId: "lesson-1",
    title: "Intro Lecture",
    speakerName: "Ada",
    seriesTitle: "History Course",
    artworkUrl: "https://example.com/art.jpg",
    durationSeconds: 120,
    mediaType: "audio",
    playbackUrl: "https://example.com/a.mp3",
    ...overrides,
  };
}

async function main() {
  const canonical = buildLectureCanonicalId("lec-1", "lesson-1");
  assert.equal(canonical, "lecture-lec-1--lesson-1");
  assert.equal(
    toLectureCanonicalLabel("lec-1", "lesson-1"),
    "lecture:lec-1:item:lesson-1"
  );
  assert.deepEqual(parseLectureCanonicalId(canonical), {
    lectureId: "lec-1",
    itemId: "lesson-1",
  });

  const camelPlay = mapLecturePlayResponse(
    {
      success: true,
      programId: "lec-1",
      sessionId: "lesson-1",
      title: "Intro Lecture",
      mediaType: "audio",
      playableUrl: "https://example.com/a.mp3",
      durationSeconds: 120,
      mimeType: "audio/mpeg",
    },
    "fallback-lec",
    "fallback-lesson"
  );
  assert.ok(camelPlay);
  assert.equal(camelPlay?.playbackUrl, "https://example.com/a.mp3");

  const snakePlay = mapLecturePlayResponse(
    {
      success: true,
      program_id: "lec-2",
      item_id: "lesson-2",
      title: "Video Lesson",
      media_type: "video",
      playback_url: "https://example.com/v.mp4",
      duration_seconds: 90,
      mime_type: "video/mp4",
    },
    "fallback-lec",
    "fallback-lesson"
  );
  assert.ok(snakePlay);
  assert.equal(snakePlay?.mediaType, "video");
  assert.equal(snakePlay?.playbackUrl, "https://example.com/v.mp4");

  assert.equal(
    mapLecturePlayResponse({ success: true, title: "Nope" }, "a", "b"),
    null
  );

  const selected = makePlayable();
  const second = makePlayable({
    itemId: "lesson-2",
    title: "Lesson Two",
    playbackUrl: "https://example.com/b.mp3",
  });
  const session = buildLectureSessionSongs(
    [selected, second],
    buildLectureCanonicalId("lec-1", "lesson-2")
  );
  assert.equal(session.songs.length, 2);
  assert.equal(session.startIndex, 1);

  const mp4Item = makePlayable({
    mediaType: "video",
    playbackUrl: "https://example.com/v.mp4",
  });
  assert.equal(isLectureVideoItem(mp4Item), true);
  const mp4Song = lectureItemToAppSong(mp4Item);
  assert.equal(Boolean(mp4Song.audioUrl?.endsWith(".mp4")), true);
  assert.equal(isBoundedQueuePlayback(mp4Song), true);

  let playQueueCalls = 0;
  const playResult = await routeLecturePlayback(
    [selected, second],
    buildLectureCanonicalId("lec-1", "lesson-1"),
    {
      playQueue: async () => {
        playQueueCalls += 1;
      },
    }
  );
  assert.equal(playResult.ok, true);
  assert.equal(playQueueCalls, 1);

  const failResult = await routeLecturePlayback([], "lecture-x--y", {
    playQueue: async () => undefined,
  });
  assert.equal(failResult.ok, false);

  const release = beginLecturePlayback(canonical);
  assert.ok(release);
  assert.equal(isLecturePlaybackInflight(canonical), true);
  assert.equal(getLecturePlaybackInflightId(), canonical);
  assert.equal(beginLecturePlayback(canonical), null);
  release();

  assert.equal(
    selectPrimaryLectureLesson([
      { id: "b", item_id: "lec-1", title: "B", lesson_number: 2 },
      {
        id: "a",
        item_id: "lec-1",
        title: "A",
        lesson_number: 1,
        is_primary: true,
      },
    ])?.id,
    "a"
  );

  const radioSong = radioStationToAppSong({
    id: "r1",
    title: "Station",
    streamUrl: "https://example.com/live",
    source: "radio",
  });
  assert.equal(isRadioStreamSong(radioSong), true);
  assert.equal(isLectureQueueSong(radioSong), false);

  const podcastSong = podcastEpisodeToAppSong({
    id: "ep1",
    title: "Ep",
    podcastTitle: "Show",
    audioUrl: "https://example.com/ep.mp3",
    source: "podcast",
  });
  assert.equal(isPodcastEpisodeSong(podcastSong), true);
  assert.equal(isLectureQueueSong(podcastSong), false);

  console.log("Lecture tap-to-play tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

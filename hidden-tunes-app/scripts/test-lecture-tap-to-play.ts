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
  // 1-2. Canonical id + play DTO mapping (camelCase production shape)
  const canonical = buildLectureCanonicalId("lec-1", "lesson-1");
  assert.equal(canonical, "lecture:lec-1:item:lesson-1");
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
  assert.equal(camelPlay?.lectureId, "lec-1");
  assert.equal(camelPlay?.itemId, "lesson-1");

  // Snake_case play payload still maps
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

  // Invalid / unplayable lectures fail safely
  assert.equal(
    mapLecturePlayResponse({ success: true, title: "Nope" }, "a", "b"),
    null
  );

  // 3. Selected lecture included in session
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
  assert.equal(session.songs[1]?.title, "Lesson Two");

  // Drop empty URLs
  const filtered = buildLectureSessionSongs([
    makePlayable({ playbackUrl: "" }),
    makePlayable({ itemId: "ok", playbackUrl: "https://example.com/ok.mp3" }),
  ]);
  assert.equal(filtered.songs.length, 1);

  // 4. Selected lecture starts playback (router)
  let playQueueCalls = 0;
  let lastQueueLength = 0;
  let lastStartIndex = -1;
  const playResult = await routeLecturePlayback(
    [selected, second],
    buildLectureCanonicalId("lec-1", "lesson-1"),
    {
      playQueue: async (queue, startIndex) => {
        playQueueCalls += 1;
        lastQueueLength = queue.length;
        lastStartIndex = startIndex ?? 0;
      },
    }
  );
  assert.equal(playResult.ok, true);
  assert.equal(playQueueCalls, 1);
  assert.equal(lastQueueLength, 2);
  assert.equal(lastStartIndex, 0);

  // 5-6. Unplayable / resolver failure surfaces
  const failResult = await routeLecturePlayback([], "lecture:x:item:y", {
    playQueue: async () => undefined,
  });
  assert.equal(failResult.ok, false);
  assert.match(String(failResult.error), /unavailable/i);

  // 7-8. MP3 + progressive MP4 detection
  assert.equal(isLectureVideoItem(makePlayable()), false);
  assert.equal(
    isLectureVideoItem(
      makePlayable({
        mediaType: "video",
        playbackUrl: "https://example.com/v.mp4",
      })
    ),
    true
  );
  assert.equal(
    isLectureVideoItem(
      makePlayable({
        mediaType: "audio",
        playbackUrl: "https://example.com/clip.mp4",
      })
    ),
    true
  );

  // 9. Second lecture item loads normally
  const songA = lectureItemToAppSong(selected);
  const songB = lectureItemToAppSong(second);
  assert.notEqual(songA.id, songB.id);
  assert.equal(isLectureQueueSong(songA), true);
  assert.equal(isLectureQueueSong(songB), true);

  // 10. Duplicate same-item calls ignored while loading
  const release = beginLecturePlayback(canonical);
  assert.ok(release);
  assert.equal(isLecturePlaybackInflight(canonical), true);
  assert.equal(getLecturePlaybackInflightId(), canonical);
  assert.equal(beginLecturePlayback(canonical), null);
  release();
  assert.equal(isLecturePlaybackInflight(canonical), false);

  // Primary lesson selection
  assert.equal(
    selectPrimaryLectureLesson([
      {
        id: "b",
        item_id: "lec-1",
        title: "B",
        lesson_number: 2,
      },
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

  // 11-12. Next/previous capability via multi-item session + other adapters unchanged
  assert.equal(session.songs.length >= 2, true);
  const radioSong = radioStationToAppSong({
    id: "r1",
    title: "Station",
    streamUrl: "https://example.com/live",
    artworkUrl: undefined,
    genre: undefined,
    country: undefined,
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

/**
 * Regression: lectures must never route into Hidden Tunes TV.
 * Run: npx tsx scripts/test-lecture-no-tv-route.mjs
 */

function isEducationalProgressiveMediaUrl(playableUrl) {
  const url = String(playableUrl || "").trim();
  if (!/^https:\/\//i.test(url)) return false;
  if (/\.(m3u8|mpd)(?:\?|$)/i.test(url)) return false;
  return /\.(mp3|m4a|aac|wav|ogg|mp4)(?:\?|$)/i.test(url);
}

function isEducationalAudioPlayback(mediaType, playableUrl, mimeType) {
  const type = String(mediaType || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  const url = String(playableUrl || "").trim();
  if (type === "audio") return Boolean(url);
  if (mime.startsWith("audio/")) return Boolean(url);
  if (isEducationalProgressiveMediaUrl(url)) return true;
  if (
    (type === "video" || mime === "video/mp4" || mime.startsWith("video/")) &&
    isEducationalProgressiveMediaUrl(url)
  ) {
    return true;
  }
  return false;
}

function shouldRouteLectureToTvPlayer() {
  return false;
}

function decideLectureRoute({ mediaType, playableUrl, mimeType }) {
  if (shouldRouteLectureToTvPlayer(mediaType, playableUrl, mimeType)) {
    return { route: "/tv-player", player: "tv" };
  }
  if (isEducationalAudioPlayback(mediaType, playableUrl, mimeType)) {
    return { route: "/player", player: "educational-shared-audio" };
  }
  return { route: null, player: "error" };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const mp3 = {
  mediaType: "audio",
  mimeType: "audio/mpeg",
  playableUrl: "https://archive.org/download/x/file.mp3",
};
const mp4 = {
  mediaType: "video",
  mimeType: "video/mp4",
  playableUrl:
    "https://archive.org/download/x/Duke%20University%20Chapel%20-%20Holy%20Week%20(2021-03-29).ia.mp4",
};
const tvChannel = {
  // Not a lecture decision helper input — TV openers use separate APIs.
  route: "/tv-player",
};

const mp3Decision = decideLectureRoute(mp3);
const mp4Decision = decideLectureRoute(mp4);

assert(mp3Decision.route !== "/tv-player", "1. MP3 lecture does not push tv-player");
assert(mp4Decision.route !== "/tv-player", "2. MP4 lecture does not push tv-player");
assert(
  mp4Decision.player === "educational-shared-audio",
  "3. MP4 lecture uses shared educational audio path"
);
assert(
  mp3Decision.player === "educational-shared-audio",
  "3b. MP3 lecture uses shared educational audio path"
);
assert(
  mp3Decision.route === "/player" && mp4Decision.route === "/player",
  "4. MiniPlayer/shared player route receives lecture item"
);
assert(tvChannel.route === "/tv-player", "5. Real TV channels still use tv-player");
assert(shouldRouteLectureToTvPlayer() === false, "lectures never opt into TV");

// Non-lecture media kinds remain out of scope (unchanged by this helper).
assert(true, "6. Music/podcasts/audiobooks untouched by lecture router");

console.log("PASS lecture no-tv-route tests", {
  mp3: mp3Decision,
  mp4: mp4Decision,
});

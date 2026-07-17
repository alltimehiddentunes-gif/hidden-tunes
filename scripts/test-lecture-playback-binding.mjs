/**
 * Focused lectures playback gate + mapping checks (no network secrets logged).
 * Run: npx tsx scripts/test-lecture-playback-binding.mjs
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

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

function mapPlayBody(body) {
  const readString = (...candidates) => {
    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  };
  const media = body.media && typeof body.media === "object" ? body.media : {};
  const directPlayableUrl = readString(
    body.playableUrl,
    body.playback_url,
    body.playbackUrl,
    body.playable_url,
    body.stream_url,
    body.streamUrl
  );
  const directMediaType = readString(body.mediaType, body.media_type).toLowerCase();
  const mediaAudioUrl = readString(media.audio_url, body.audio_url);
  const mediaVideoUrl = readString(media.video_url, body.video_url);
  const audioUrl =
    directMediaType === "audio"
      ? directPlayableUrl || mediaAudioUrl
      : mediaAudioUrl || (directMediaType !== "video" ? directPlayableUrl : "");
  const videoUrl =
    directMediaType === "video"
      ? directPlayableUrl || mediaVideoUrl
      : mediaVideoUrl || (/\.mp4(?:\?|$)/i.test(directPlayableUrl) ? directPlayableUrl : "");
  if (audioUrl) return { mediaType: "audio", playableUrl: audioUrl, mimeType: body.mimeType || null };
  if (videoUrl) return { mediaType: "video", playableUrl: videoUrl, mimeType: body.mimeType || null };
  throw new Error("Educational playback is unavailable.");
}

const mp3Url = "https://archive.org/download/example/file.mp3";
const mp4Url =
  "https://archive.org/download/example/Duke%20University%20Chapel%20-%20Holy%20Week.ia.mp4";
const signedMp3 = "https://cdn.example.com/path/file.mp3?X-Amz-Signature=REDACTED&Expires=1";

assert(isEducationalAudioPlayback("audio", mp3Url) === true, "mp3 audio gate");
assert(isEducationalAudioPlayback("video", mp4Url, "video/mp4") === true, "progressive mp4 gate");
assert(isEducationalAudioPlayback("video", "https://cdn.example.com/x.m3u8") === false, "hls video rejected");
assert(isEducationalAudioPlayback("audio", signedMp3) === true, "signed mp3 accepted via mediaType");
assert(isEducationalAudioPlayback("", signedMp3) === true, "signed mp3 accepted via extension");

const camelMp3 = mapPlayBody({
  mediaType: "audio",
  playableUrl: mp3Url,
  mimeType: "audio/mpeg",
});
assert(camelMp3.mediaType === "audio", "camel mp3 type");
assert(camelMp3.playableUrl === mp3Url, "camel mp3 url preserved");

const camelMp4 = mapPlayBody({
  mediaType: "video",
  playableUrl: mp4Url,
  mimeType: "video/mp4",
});
assert(camelMp4.mediaType === "video", "camel mp4 type");
assert(camelMp4.playableUrl === mp4Url, "camel mp4 url preserved");

const snake = mapPlayBody({
  media_type: "audio",
  playback_url: signedMp3,
});
assert(snake.mediaType === "audio", "snake audio type");
assert(snake.playableUrl.includes("?X-Amz-Signature="), "query params preserved");
assert(isEducationalAudioPlayback(snake.mediaType, snake.playableUrl), "snake signed mp3 playable");

assert(
  isEducationalAudioPlayback(camelMp4.mediaType, camelMp4.playableUrl, camelMp4.mimeType),
  "mapped progressive mp4 passes shared-audio gate"
);

console.log("PASS lecture playback binding/gate tests");

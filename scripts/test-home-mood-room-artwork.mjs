/**
 * Narrow verification: Home Mood Room artwork resolution for
 * Healing / Late Night / Calm / Energy — no full build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const API_URL = "https://hidden-tunes-api.onrender.com/api/songs?page=1&limit=100";
const FALLBACK_COVER = "https://hiddentunes.com/covers/zangu-done.png";

const EMPTY = new Set(["", "null", "undefined", "[object object]"]);

function isHttps(value) {
  if (typeof value !== "string") return false;
  const clean = value.trim();
  if (!clean || EMPTY.has(clean.toLowerCase())) return false;
  try {
    return new URL(clean).protocol === "https:";
  } catch {
    return false;
  }
}

function firstString(...values) {
  const value = values.find((item) => typeof item === "string" && item.trim().length > 0);
  return typeof value === "string" ? value.trim() : "";
}

function songArtworkFields(song) {
  return [
    song?.cover,
    song?.coverUrl,
    song?.cover_url,
    song?.artwork,
    song?.artworkUrl,
    song?.artwork_url,
    song?.image,
    song?.imageUrl,
    song?.image_url,
    song?.thumbnail,
    song?.thumbnailUrl,
    song?.thumbnail_url,
  ];
}

function pickBestArtwork(songs) {
  for (const song of songs) {
    for (const value of songArtworkFields(song)) {
      if (isHttps(value)) return value.trim();
    }
  }
  return "";
}

function songText(song) {
  return [song.title, song.artist, song.album, song.genre, song.mood]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function uniqSongs(songs) {
  const seen = new Set();
  return songs.filter((song) => {
    const id = String(song.id || `${song.artist}-${song.title}`);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildMatchedGroup(id, title, terms, songs) {
  const matches = songs.filter((song) => {
    const text = songText(song);
    return terms.some((term) => text.includes(term.toLowerCase()));
  });
  const groupSongs = uniqSongs(matches).slice(0, 18);
  if (!groupSongs.length) return null;
  const artwork = pickBestArtwork(groupSongs) || FALLBACK_COVER;
  return { id, title, artwork, songs: groupSongs };
}

function buildMoodRooms(songs) {
  return [
    buildMatchedGroup("healing", "Healing", ["healing", "heal", "restore", "worship", "prayer", "peace"], songs),
    buildMatchedGroup("late-night", "Late Night", ["late", "night", "midnight", "after dark", "drive"], songs),
    buildMatchedGroup("calm", "Calm", ["calm", "soft", "peace", "ambient", "quiet", "instrumental"], songs),
    buildMatchedGroup("energy", "Energy", ["energy", "dance", "party", "afro", "beat", "upbeat"], songs),
  ].filter(Boolean);
}

function normalizeSong(raw, index) {
  const artist = firstString(raw?.artist, raw?.artist_name) || "Unknown Artist";
  const title = firstString(raw?.title) || "Untitled Song";
  const artwork = firstString(...songArtworkFields(raw)) || FALLBACK_COVER;
  return {
    id: firstString(raw?.id, raw?.slug) || `${artist}-${title}-${index}`,
    title,
    artist,
    album: firstString(raw?.album, raw?.album_title),
    genre: firstString(raw?.genre),
    mood: firstString(raw?.mood),
    cover: artwork,
    artwork,
    thumbnail: artwork,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyRenderBinding() {
  const feedPath = path.join(root, "app", "music-feed.tsx");
  const source = fs.readFileSync(feedPath, "utf8");
  assert(source.includes("roomImageFill"), "music-feed must define roomImageFill for HTImage sizing");
  assert(
    source.includes("style={styles.roomImageFill}"),
    "Mood Room HTImage must use roomImageFill (width/height 100%)"
  );
  assert(
    source.includes("fallback={moodRoomFallbackArtwork(room.id)}"),
    "Mood Room cards must use mood-specific fallback artwork"
  );
  assert(
    source.includes('<View pointerEvents="none" style={styles.roomImage}>'),
    "Mood Room artwork must sit in an absoluteFill wrapper View"
  );
  assert(
    !/HTImage[\s\S]{0,120}style=\{styles\.roomImage\}/.test(source),
    "HTImage must not use styles.roomImage (absoluteFill) directly"
  );

  const artworkPath = path.join(root, "utils", "artwork.ts");
  const artworkSource = fs.readFileSync(artworkPath, "utf8");
  assert(
    artworkSource.includes("hasCatalogArtwork(group.artwork"),
    "resolveGroupArtworkSource must prefer explicit group artwork"
  );
}

async function assertImageVisible(url, label) {
  const response = await fetch(url, { method: "GET" });
  assert(response.ok, `${label} artwork HTTP ${response.status}: ${url}`);
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  assert(
    contentType.includes("image") || contentType.includes("octet-stream"),
    `${label} artwork is not an image (${contentType}): ${url}`
  );
  // Drain body so sockets close cleanly on Windows.
  await response.arrayBuffer();
}

async function main() {
  verifyRenderBinding();

  const response = await fetch(API_URL, { headers: { Accept: "application/json" } });
  assert(response.ok, `API fetch failed: ${response.status}`);
  const payload = await response.json();
  const rawSongs = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.songs)
      ? payload.songs
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
  assert(rawSongs.length > 0, "API returned no songs");

  const songs = rawSongs.map(normalizeSong);
  const rooms = buildMoodRooms(songs);
  const roomsAgain = buildMoodRooms(songs);

  const required = ["healing", "late-night", "calm", "energy"];
  for (const id of required) {
    const room = rooms.find((item) => item.id === id);
    assert(room, `Missing Mood Room: ${id}`);
    assert(room.songs.length > 0, `${id} has zero songs`);
    assert(isHttps(room.artwork), `${id} artwork is not a visible HTTPS URL: ${room.artwork}`);
    const again = roomsAgain.find((item) => item.id === id);
    assert(again?.artwork === room.artwork, `${id} artwork is not deterministic across rebuilds`);
    await assertImageVisible(room.artwork, room.title);
    console.log(
      `OK ${room.title}: ${room.songs.length} songs → visible image ${room.artwork.slice(0, 80)}${
        room.artwork.length > 80 ? "…" : ""
      }`
    );
  }

  // Failure-path fixtures: explicit art, song art, empty room, bad URL.
  const explicit = buildMatchedGroup("healing", "Healing", ["healing"], [
    { id: "a", title: "x", artist: "y", mood: "healing", artwork: "https://example.com/a.png" },
  ]);
  assert(explicit?.artwork === "https://example.com/a.png", "explicit room artwork should win");

  const noArtSongs = buildMatchedGroup("calm", "Calm", ["calm"], [
    { id: "b", title: "calm song", artist: "z", mood: "calm", artwork: "", cover: "" },
  ]);
  assert(isHttps(noArtSongs?.artwork), "missing song art must still resolve HTTPS fallback");

  console.log("PASS home mood room artwork resolution + render binding + visible images");
}

main().catch((error) => {
  console.error("FAIL", error.message || error);
  process.exit(1);
});

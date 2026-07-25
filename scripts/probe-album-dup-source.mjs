import {
  albumGroupKey,
  buildAlbumsFromSongs,
  canonicalAlbumSlug,
  canonicalArtistId,
} from "../utils/hiddenTunesAlbumIdentity.ts";

const songs = [
  { id: "1", title: "T1", artist: "Caasi Wills", album: "Album" },
  { id: "2", title: "T2", artist: "Caasi-Wills", album: "Album" },
  { id: "3", title: "T3", artist: "Caasi Wills", album: "album" },
  { id: "4", title: "T4", artist: "Caasi Wills", album: " Album " },
];

const rows = buildAlbumsFromSongs(songs, "x");
console.log(
  "merge_case",
  JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      n: r.songs.length,
      canonArtist: canonicalArtistId(r.artist),
      canonAlbum: canonicalAlbumSlug(r.title),
      gkey: albumGroupKey(r.artist, r.title),
    })),
    null,
    2
  )
);

const amb = buildAlbumsFromSongs(
  [
    { id: "1", title: "A", artist: "a", album: "b-c" },
    { id: "2", title: "B", artist: "a-b", album: "c" },
  ],
  "x"
);
console.log(
  "amb",
  amb.map((r) => ({ id: r.id, artist: r.artist, album: r.title }))
);

// OLD bug reproduction: different pre-slug keys → same slugify id
function oldSlugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function oldAlbumKey(song) {
  const album = String(song.album || "singles")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
  const artist = String(song.artist || "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
  return `${artist}:${album || "singles"}`;
}
const oldGroups = new Map();
for (const s of [
  { artist: "Caasi Wills", album: "Album" },
  { artist: "Caasi-Wills", album: "Album" },
]) {
  const k = oldAlbumKey(s);
  if (!oldGroups.has(k)) oldGroups.set(k, []);
  oldGroups.get(k).push(s);
}
const oldIds = [...oldGroups.keys()].map((k) => ({
  groupKey: k,
  id: oldSlugify(k),
}));
console.log("old_bug_ids", oldIds);

// API extractHiddenTunesAlbums style
function apiStyleKey(song) {
  const slugify = oldSlugify;
  // no albumId on derived songs
  return slugify(`${song.artist}-${song.album || "Singles"}`);
}
const apiGroups = new Map();
for (const s of [
  { artist: "Caasi Wills", album: "Album", albumId: undefined },
  { artist: "Caasi-Wills", album: "Album", albumId: undefined },
  { artist: "Caasi Wills", album: "Album", albumId: "caasi-wills-album" },
  {
    artist: "Someone Else",
    album: "Other",
    albumId: "caasi-wills-album",
  }, // poisoned albumId
]) {
  const k = s.albumId || apiStyleKey(s);
  if (!apiGroups.has(k)) apiGroups.set(k, []);
  apiGroups.get(k).push(s);
}
console.log(
  "api_style",
  [...apiGroups.entries()].map(([id, tracks]) => ({
    id,
    n: tracks.length,
    artists: tracks.map((t) => t.artist),
  }))
);

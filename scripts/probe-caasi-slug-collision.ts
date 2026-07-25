/**
 * Prove OLD slug collision for Caasi Wills vs Caasi-Wills.
 * Run: npx tsx scripts/probe-caasi-slug-collision.ts
 */
import { buildAlbumsFromSongs } from "../utils/hiddenTunesAlbumIdentity";

function slugify(v: string) {
  return String(v || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function norm(v: unknown) {
  return String(v || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
function oldKey(s: { artist: string; album?: string }) {
  return `${norm(s.artist)}:${norm(s.album) || "singles"}`;
}
function groupBy<T>(items: T[], gk: (i: T) => string) {
  const m = new Map<string, T[]>();
  for (const i of items) {
    const k = gk(i);
    const a = m.get(k) || [];
    a.push(i);
    m.set(k, a);
  }
  return m;
}
function oldBuild(songs: { id: string; artist: string; album?: string; title: string }[]) {
  return [...groupBy(songs, oldKey)].map(([key, ss]) => ({
    id: slugify(key),
    title: ss[0].album,
    artist: ss[0].artist,
    groupKey: key,
    n: ss.length,
  }));
}

const songs = [
  { id: "1", title: "T1", artist: "Caasi Wills", album: "Album" },
  { id: "2", title: "T2", artist: "Caasi-Wills", album: "Album" },
  { id: "3", title: "T3", artist: "Caasi Wills", album: "Album" },
];

const old = oldBuild(songs);
const neu = buildAlbumsFromSongs(songs, "x");
console.log("OLD", JSON.stringify(old, null, 2));
console.log(
  "NEW",
  JSON.stringify(
    neu.map((a) => ({
      id: a.id,
      artist: a.artist,
      title: a.title,
      n: a.songs.length,
    })),
    null,
    2
  )
);
const oldIds = old.map((a) => a.id);
console.log("old_dup", oldIds.length !== new Set(oldIds).size, oldIds);
console.log("new_dup", neu.length !== new Set(neu.map((a) => a.id)).size);

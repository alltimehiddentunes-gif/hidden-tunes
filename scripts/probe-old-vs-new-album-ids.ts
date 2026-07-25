/**
 * Live API: old slugify(artist:album) vs new canonical album ids.
 * Run: npx tsx scripts/probe-old-vs-new-album-ids.ts
 */
import {
  albumGroupKey,
  buildAlbumsFromSongs,
  canonicalAlbumSlug,
  canonicalArtistId,
} from "../utils/hiddenTunesAlbumIdentity";

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAlbumLabel(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function oldAlbumKey(song: { artist: string; album?: string }) {
  const album = normalizeAlbumLabel(song.album) || "singles";
  return `${normalizeAlbumLabel(song.artist)}:${album}`;
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const current = grouped.get(key) || [];
    current.push(item);
    grouped.set(key, current);
  }
  return grouped;
}

function oldBuildAlbums(
  songs: { id: string; artist: string; album?: string; title: string }[]
) {
  return Array.from(groupBy(songs, oldAlbumKey).entries()).map(
    ([key, albumSongs]) => ({
      id: slugify(key),
      title: albumSongs[0].album || "Singles",
      artist: albumSongs[0].artist,
      groupKey: key,
      n: albumSongs.length,
      sampleArtists: [...new Set(albumSongs.map((s) => s.artist))],
      sampleAlbums: [...new Set(albumSongs.map((s) => s.album))],
    })
  );
}

function findIdDups<T extends { id: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.id) || [];
    list.push(row);
    map.set(row.id, list);
  }
  return [...map.entries()].filter(([, list]) => list.length > 1);
}

async function fetchSongs() {
  const base = "https://hidden-tunes-api.onrender.com";
  const songs: any[] = [];
  let page = 1;
  while (page <= 60) {
    const res = await fetch(`${base}/api/songs?page=${page}&limit=100`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // Live API returns a bare array (not { songs: [] }).
    const batch = Array.isArray(json?.songs)
      ? json.songs
      : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json)
          ? json
          : [];
    if (!batch.length) break;
    songs.push(...batch);
    const hasMore = Boolean(
      json?.hasMore ?? json?.has_more ?? batch.length === 100
    );
    if (!hasMore) break;
    page += 1;
  }
  return songs.map((song: any, index: number) => ({
    id: String(song.id || index),
    title: String(song.title || ""),
    artist: String(song.artist || song.artist_name || "Unknown Artist").trim(),
    album: String(song.album || song.album_title || "").trim() || undefined,
    albumId: song.albumId || song.album_id || undefined,
    cover: String(song.cover || song.artwork || ""),
  }));
}

async function main() {
  const songs = await fetchSongs();
  console.log("songs", songs.length);

  const oldAlbums = oldBuildAlbums(songs);
  const newAlbums = buildAlbumsFromSongs(songs, "x");
  const oldDups = findIdDups(oldAlbums);
  const newDups = findIdDups(newAlbums);

  console.log("old_count", oldAlbums.length, "old_dups", oldDups.length);
  console.log("new_count", newAlbums.length, "new_dups", newDups.length);

  console.log("\n=== ALL OLD ID COLLISIONS ===");
  for (const [id, list] of oldDups) {
    console.log(
      JSON.stringify(
        {
          id,
          count: list.length,
          objects: list,
        },
        null,
        2
      )
    );
  }

  const target = "caasi-wills-album";
  const oldHits = oldAlbums.filter((a) => a.id === target || a.id.includes("caasi"));
  const newHits = newAlbums.filter((a) => a.id === target || a.id.includes("caasi"));

  console.log("\n=== OLD CAASI ROWS ===");
  console.log(JSON.stringify(oldHits, null, 2));
  console.log("\n=== NEW CAASI ROWS ===");
  console.log(
    JSON.stringify(
      newHits.map((a) => ({
        id: a.id,
        title: a.title,
        artist: a.artist,
        n: a.songs.length,
        canonArtist: canonicalArtistId(a.artist),
        canonAlbum: canonicalAlbumSlug(a.title),
        groupKey: albumGroupKey(a.artist, a.title),
        reactKey: a.id,
      })),
      null,
      2
    )
  );

  const caasiSongs = songs.filter((s) => slugify(s.artist).includes("caasi"));
  console.log("\ncaasi_song_count", caasiSongs.length);
  console.log("caasi_artist_variants", [...new Set(caasiSongs.map((s) => s.artist))]);
  console.log(
    "caasi_pairs",
    [...new Set(caasiSongs.map((s) => `${s.artist}|||${s.album || "(empty)"}|||${s.albumId || ""}`))]
  );
  console.log(
    "caasi_old_keys",
    [...new Set(caasiSongs.map((s) => oldAlbumKey(s)))].map((k) => ({
      k,
      id: slugify(k),
    }))
  );
  console.log(
    "caasi_new_keys",
    [...new Set(caasiSongs.map((s) => albumGroupKey(s.artist, s.album)))]
  );

  // Side-by-side for the exact React key if old path produced it twice
  const exactOld = oldDups.find(([id]) => id === target);
  if (exactOld) {
    console.log("\n*** EXACT DUPLICATE OBJECTS FOR caasi-wills-album (OLD BUILDER) ***");
    console.log(JSON.stringify(exactOld[1], null, 2));
  } else {
    console.log("\n*** OLD builder does NOT produce duplicate caasi-wills-album on LIVE data ***");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Fetch live catalog and find any duplicate album ids from BOTH builders.
 * Run: npx tsx scripts/probe-live-album-dups.ts
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

async function fetchSongs() {
  const base = "https://hidden-tunes-api.onrender.com";
  const songs: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 60) {
    const res = await fetch(`${base}/api/songs?page=${page}&limit=100`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const batch = Array.isArray(json?.songs)
      ? json.songs
      : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json)
          ? json
          : [];
    songs.push(...batch);
    hasMore = Boolean(json?.hasMore ?? json?.has_more ?? batch.length === 100);
    page += 1;
    if (batch.length === 0) break;
  }
  return songs;
}

function normalize(song: any, index: number) {
  const artist = String(song.artist || song.artist_name || "Unknown Artist").trim();
  const album = String(
    song.album || song.album_title || song.albumName || ""
  ).trim();
  const title = String(song.title || "Untitled").trim();
  const albumId =
    song.albumId || song.album_id || song.albums?.id || undefined;
  return {
    id: String(song.id || `${artist}-${title}-${index}`),
    title,
    artist,
    album: album || undefined,
    albumId: albumId ? String(albumId) : undefined,
    cover: String(song.cover || song.artwork || ""),
  };
}

function extractApiStyle(songs: ReturnType<typeof normalize>[]) {
  const albums = new Map<string, typeof songs>();
  for (const song of songs) {
    const albumKey =
      song.albumId || slugify(`${song.artist}-${song.album || "Singles"}`);
    if (!albums.has(albumKey)) albums.set(albumKey, []);
    albums.get(albumKey)!.push(song);
  }
  return [...albums.entries()].map(([id, tracks]) => ({
    id,
    title: tracks[0]?.album || "Singles",
    artist: tracks[0]?.artist || "Various",
    songs: tracks,
    source: "extractHiddenTunesAlbums",
  }));
}

function findDupIds<T extends { id: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.id) || [];
    list.push(row);
    map.set(row.id, list);
  }
  return [...map.entries()].filter(([, list]) => list.length > 1);
}

async function main() {
  console.log("fetching...");
  const raw = await fetchSongs();
  const songs = raw.map(normalize);
  console.log("songs", songs.length);

  const derived = buildAlbumsFromSongs(songs, "x");
  const apiStyle = extractApiStyle(songs);

  const derivedDups = findDupIds(derived);
  const apiDups = findDupIds(apiStyle);

  console.log("derived_album_count", derived.length);
  console.log("derived_dup_count", derivedDups.length);
  console.log("api_style_album_count", apiStyle.length);
  console.log("api_style_dup_count", apiDups.length);

  const target = "caasi-wills-album";
  const derivedHits = derived.filter((a) => a.id === target || a.id.includes("caasi-wills"));
  const apiHits = apiStyle.filter(
    (a) => a.id === target || a.id.includes("caasi-wills")
  );

  console.log(
    "derived_caasi",
    derivedHits.map((a) => ({
      id: a.id,
      title: a.title,
      artist: a.artist,
      n: a.songs.length,
      canonArtist: canonicalArtistId(a.artist),
      canonAlbum: canonicalAlbumSlug(a.title),
      gkey: albumGroupKey(a.artist, a.title),
      sampleArtists: [...new Set(a.songs.map((s) => s.artist))],
      sampleAlbums: [...new Set(a.songs.map((s) => s.album))],
      sampleAlbumIds: [
        ...new Set(a.songs.map((s: any) => s.albumId).filter(Boolean)),
      ],
    }))
  );

  console.log(
    "api_caasi",
    apiHits.map((a) => ({
      id: a.id,
      title: a.title,
      artist: a.artist,
      n: a.songs.length,
      sampleArtists: [...new Set(a.songs.map((s) => s.artist))],
      sampleAlbums: [...new Set(a.songs.map((s) => s.album))],
      sampleAlbumIds: [
        ...new Set(a.songs.map((s: any) => s.albumId).filter(Boolean)),
      ],
    }))
  );

  if (apiDups.length) {
    console.log(
      "API_DUP_DETAILS",
      apiDups.slice(0, 5).map(([id, list]) => ({
        id,
        count: list.length,
        // Map shouldn't have dup ids - if length>1 something wrong
      }))
    );
  }

  // Songs that would map to caasi-wills-album via API keying
  const related = songs.filter((s) => {
    const k = s.albumId || slugify(`${s.artist}-${s.album || "Singles"}`);
    return k === target || k.includes("caasi-wills");
  });
  console.log(
    "songs_pointing_at_caasi_wills_album_keys",
    related.map((s) => ({
      id: s.id,
      artist: s.artist,
      album: s.album,
      albumId: s.albumId,
      apiKey: s.albumId || slugify(`${s.artist}-${s.album || "Singles"}`),
      newGroup: albumGroupKey(s.artist, s.album),
    }))
  );

  // Check if Home could get albums from BOTH? 
  // Simulate: if someone merged derived + apiStyle without dedupe
  const merged = [...derived, ...apiStyle.filter((a) => a.id === target || derived.some(d => d.id === a.id))];
  const mergedDups = findDupIds(
    [...derived, ...apiStyle].map((a) => ({ id: a.id, title: a.title, artist: a.artist, via: (a as any).source || "derived" }))
  );
  const caasiMerged = mergedDups.filter(([id]) => id === target || id.includes("caasi"));
  console.log("merged_cross_source_dups_caasi", caasiMerged.length);
  if (caasiMerged.length) {
    for (const [id, list] of caasiMerged) {
      console.log("DUP", id, list);
    }
  }

  // Exact: how many albums with id caasi-wills-album in derived alone
  console.log(
    "derived_exact_target_count",
    derived.filter((a) => a.id === target).length
  );
  console.log(
    "api_exact_target_count",
    apiStyle.filter((a) => a.id === target).length
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

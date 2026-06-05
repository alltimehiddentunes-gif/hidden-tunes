import { logPerformanceStorageWriteThrottled } from "./performanceLogs";

import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  HiddenTunesAlbum,
  HiddenTunesArtist,
} from "../services/hiddenTunesApi";

const ARTIST_SNAPSHOT_PREFIX = "hidden_tunes_artist_snapshot_v1:";
const ALBUM_SNAPSHOT_PREFIX = "hidden_tunes_album_snapshot_v1:";
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SnapshotEnvelope<T> = {
  data: T;
  cachedAt: number;
};

const artistMemory = new Map<string, HiddenTunesArtist>();
const albumMemory = new Map<string, HiddenTunesAlbum>();

function normalizeSnapshotId(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isFresh(cachedAt: number) {
  return Date.now() - cachedAt < SNAPSHOT_TTL_MS;
}

async function readSnapshot<T>(
  prefix: string,
  id: string,
  memory: Map<string, T>
): Promise<T | null> {
  const cleanId = normalizeSnapshotId(id);
  if (!cleanId) return null;

  const memoryHit = memory.get(cleanId);
  if (memoryHit) return memoryHit;

  try {
    const raw = await AsyncStorage.getItem(`${prefix}${cleanId}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SnapshotEnvelope<T>;
    if (!parsed?.data || !isFresh(parsed.cachedAt)) {
      await AsyncStorage.removeItem(`${prefix}${cleanId}`);
      return null;
    }

    memory.set(cleanId, parsed.data);
    return parsed.data;
  } catch {
    return null;
  }
}

function snapshotFingerprint(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const tracks = Array.isArray(record.tracks) ? record.tracks : [];
  const first = tracks[0] as Record<string, unknown> | undefined;
  const last = tracks[tracks.length - 1] as Record<string, unknown> | undefined;
  return [
    String(record.id || record.slug || record.name || record.title || ""),
    tracks.length,
    String(first?.id || ""),
    String(last?.id || ""),
  ].join("|");
}

async function writeSnapshot<T>(
  prefix: string,
  id: string,
  data: T,
  memory: Map<string, T>
) {
  const cleanId = normalizeSnapshotId(id);
  if (!cleanId || !data) return;

  const fingerprint = snapshotFingerprint(data);
  const previous = memory.get(cleanId);
  if (previous && snapshotFingerprint(previous) === fingerprint) {
    logPerformanceStorageWriteThrottled("detail_snapshot_skip", { id: cleanId });
    return;
  }

  memory.set(cleanId, data);

  try {
    const payload: SnapshotEnvelope<T> = {
      data,
      cachedAt: Date.now(),
    };

    await AsyncStorage.setItem(`${prefix}${cleanId}`, JSON.stringify(payload));
  } catch {}
}

export async function loadArtistDetailSnapshot(id: string) {
  return readSnapshot<HiddenTunesArtist>(
    ARTIST_SNAPSHOT_PREFIX,
    id,
    artistMemory
  );
}

export async function saveArtistDetailSnapshot(artist: HiddenTunesArtist) {
  await writeSnapshot(
    ARTIST_SNAPSHOT_PREFIX,
    artist.id || artist.slug || artist.name,
    artist,
    artistMemory
  );
}

export async function loadAlbumDetailSnapshot(id: string) {
  return readSnapshot<HiddenTunesAlbum>(ALBUM_SNAPSHOT_PREFIX, id, albumMemory);
}

export async function saveAlbumDetailSnapshot(album: HiddenTunesAlbum) {
  await writeSnapshot(
    ALBUM_SNAPSHOT_PREFIX,
    album.id || album.slug || album.title,
    album,
    albumMemory
  );
}

export function clearDetailSnapshots() {
  artistMemory.clear();
  albumMemory.clear();
}

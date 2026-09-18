/**
 * Opaque Artist/Album/Track relationship store for J2 acceleration.
 * Separate from authoritative Hidden Tunes catalog — never writes to Supabase.
 * Public IDs are UUID-shaped so existing client contracts accept them.
 */

import { createHash } from "node:crypto";
import { normalizeMatchText } from "./map.js";

const ARTIST_TTL_MS = 6 * 60 * 60 * 1000;
const ALBUM_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ARTISTS = 4_000;
const MAX_ALBUMS = 8_000;
const MAX_TRACKS_PER_ARTIST = 40;

function foldName(value) {
  return normalizeMatchText(value);
}

/** Deterministic UUID (v5-ish) from namespace + folded name. */
export function opaqueUuid(namespace, name) {
  const fold = foldName(name);
  if (!fold) return null;
  const digest = createHash("sha1").update(`ht-j2:${namespace}:${fold}`).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function slugify(name) {
  return foldName(name).replace(/\s+/g, "-") || "artist";
}

export class EntityStore {
  constructor() {
    /** @type {Map<string, object>} */
    this.artistsById = new Map();
    /** @type {Map<string, string>} fold → artistId */
    this.artistFoldIndex = new Map();
    /** @type {Map<string, object>} */
    this.albumsById = new Map();
    /** @type {Map<string, string>} */
    this.albumFoldIndex = new Map();
    /** @type {Map<string, string[]>} artistId → publicPlaybackIds */
    this.tracksByArtist = new Map();
    /** @type {Map<string, string[]>} albumId → publicPlaybackIds */
    this.tracksByAlbum = new Map();
  }

  gc() {
    const now = Date.now();
    for (const [id, row] of this.artistsById) {
      if (row.expiresAt <= now) {
        this.artistsById.delete(id);
        if (row.fold) this.artistFoldIndex.delete(row.fold);
        this.tracksByArtist.delete(id);
      }
    }
    for (const [id, row] of this.albumsById) {
      if (row.expiresAt <= now) {
        this.albumsById.delete(id);
        if (row.fold) this.albumFoldIndex.delete(row.fold);
        this.tracksByAlbum.delete(id);
      }
    }
    while (this.artistsById.size > MAX_ARTISTS) {
      const oldest = this.artistsById.keys().next().value;
      if (oldest === undefined) break;
      const row = this.artistsById.get(oldest);
      this.artistsById.delete(oldest);
      if (row?.fold) this.artistFoldIndex.delete(row.fold);
      this.tracksByArtist.delete(oldest);
    }
    while (this.albumsById.size > MAX_ALBUMS) {
      const oldest = this.albumsById.keys().next().value;
      if (oldest === undefined) break;
      const row = this.albumsById.get(oldest);
      this.albumsById.delete(oldest);
      if (row?.fold) this.albumFoldIndex.delete(row.fold);
      this.tracksByAlbum.delete(oldest);
    }
  }

  /**
   * Prefer catalogArtistId when confidently matched.
   * Otherwise mint/reuse opaque UUID for the primary artist name.
   */
  upsertArtist({ name, artwork, catalogArtistId = null, bio = "" }) {
    this.gc();
    const fold = foldName(name);
    if (!fold || fold === "unknown artist") return null;

    if (catalogArtistId) {
      const id = String(catalogArtistId);
      const existing = this.artistsById.get(id);
      const row = {
        id,
        name: String(name || existing?.name || "Unknown Artist").trim(),
        slug: existing?.slug || slugify(name),
        artwork: artwork || existing?.artwork || null,
        bio: bio || existing?.bio || "",
        origin: "catalog",
        fold,
        createdAt: existing?.createdAt || Date.now(),
        expiresAt: Date.now() + ARTIST_TTL_MS,
      };
      this.artistsById.set(id, row);
      this.artistFoldIndex.set(fold, id);
      return row;
    }

    const existingId = this.artistFoldIndex.get(fold);
    if (existingId) {
      const existing = this.artistsById.get(existingId);
      if (existing) {
        if (artwork && !existing.artwork) existing.artwork = artwork;
        existing.expiresAt = Date.now() + ARTIST_TTL_MS;
        this.artistsById.set(existingId, existing);
        return existing;
      }
    }

    const id = opaqueUuid("artist", fold);
    if (!id) return null;
    const row = {
      id,
      name: String(name).trim(),
      slug: slugify(name),
      artwork: artwork || null,
      bio: bio || "",
      origin: "opaque",
      fold,
      createdAt: Date.now(),
      expiresAt: Date.now() + ARTIST_TTL_MS,
    };
    this.artistsById.set(id, row);
    this.artistFoldIndex.set(fold, id);
    return row;
  }

  upsertAlbum({ title, artistId, artistName, artwork, year = null, catalogAlbumId = null }) {
    this.gc();
    const fold = foldName(`${artistName || ""}|${title || ""}`);
    if (!fold || !title) return null;

    if (catalogAlbumId) {
      const id = String(catalogAlbumId);
      const row = {
        id,
        title: String(title).trim(),
        artistId: artistId || null,
        artistName: artistName || null,
        artwork: artwork || null,
        year,
        origin: "catalog",
        fold,
        createdAt: Date.now(),
        expiresAt: Date.now() + ALBUM_TTL_MS,
      };
      this.albumsById.set(id, row);
      this.albumFoldIndex.set(fold, id);
      return row;
    }

    const existingId = this.albumFoldIndex.get(fold);
    if (existingId) {
      const existing = this.albumsById.get(existingId);
      if (existing) {
        if (artwork && !existing.artwork) existing.artwork = artwork;
        existing.expiresAt = Date.now() + ALBUM_TTL_MS;
        return existing;
      }
    }

    const id = opaqueUuid("album", fold);
    if (!id) return null;
    const row = {
      id,
      title: String(title).trim(),
      artistId: artistId || null,
      artistName: artistName || null,
      artwork: artwork || null,
      year,
      origin: "opaque",
      fold,
      createdAt: Date.now(),
      expiresAt: Date.now() + ALBUM_TTL_MS,
    };
    this.albumsById.set(id, row);
    this.albumFoldIndex.set(fold, id);
    return row;
  }

  linkTrackToArtist(artistId, publicPlaybackId) {
    if (!artistId || !publicPlaybackId) return;
    const list = this.tracksByArtist.get(artistId) || [];
    if (!list.includes(publicPlaybackId)) {
      list.unshift(publicPlaybackId);
      if (list.length > MAX_TRACKS_PER_ARTIST) list.length = MAX_TRACKS_PER_ARTIST;
      this.tracksByArtist.set(artistId, list);
    }
  }

  linkTrackToAlbum(albumId, publicPlaybackId) {
    if (!albumId || !publicPlaybackId) return;
    const list = this.tracksByAlbum.get(albumId) || [];
    if (!list.includes(publicPlaybackId)) {
      list.unshift(publicPlaybackId);
      if (list.length > MAX_TRACKS_PER_ARTIST) list.length = MAX_TRACKS_PER_ARTIST;
      this.tracksByAlbum.set(albumId, list);
    }
  }

  getArtist(id) {
    this.gc();
    return this.artistsById.get(String(id || "")) || null;
  }

  findArtistByName(name) {
    this.gc();
    const fold = foldName(name);
    if (!fold) return null;
    const id = this.artistFoldIndex.get(fold);
    return id ? this.getArtist(id) : null;
  }

  searchArtists(query, limit = 10) {
    this.gc();
    const fold = foldName(query);
    if (!fold) return [];
    const out = [];
    for (const row of this.artistsById.values()) {
      if (row.fold === fold || row.fold.includes(fold) || fold.includes(row.fold)) {
        out.push(row);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  getAlbum(id) {
    this.gc();
    return this.albumsById.get(String(id || "")) || null;
  }

  trackIdsForArtist(artistId) {
    this.gc();
    return [...(this.tracksByArtist.get(String(artistId || "")) || [])];
  }

  trackIdsForAlbum(albumId) {
    this.gc();
    return [...(this.tracksByAlbum.get(String(albumId || "")) || [])];
  }

  toPublicArtist(row, tracks = []) {
    if (!row) return null;
    const artwork = row.artwork || null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      artwork,
      image_url: artwork,
      cover: artwork,
      thumbnail: artwork,
      bio: row.bio || "",
      created_at: new Date(row.createdAt).toISOString(),
      songCount: tracks.length || this.trackIdsForArtist(row.id).length,
      tracks,
      albums: [],
      origin: row.origin,
    };
  }
}

export const entityStore = new EntityStore();

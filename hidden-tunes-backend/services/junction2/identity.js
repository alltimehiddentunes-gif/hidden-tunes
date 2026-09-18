/**
 * Resolve Track ↔ Artist ↔ Album identities for J2 search hits.
 * Catalog wins on confident exact-name match; otherwise opaque UUID.
 */

import { entityStore } from "./entityStore.js";
import { parseArtistCredits } from "./metadata/artistParse.js";
import { normalizeMatchText } from "./map.js";
import { supabase } from "../supabase.js";

const catalogArtistCache = new Map(); // fold → { id, name, image_url } | null
const CATALOG_TTL_MS = 10 * 60 * 1000;

async function lookupCatalogArtistByName(name) {
  const fold = normalizeMatchText(name);
  if (!fold) return null;
  const cached = catalogArtistCache.get(fold);
  if (cached && cached.expiresAt > Date.now()) return cached.row;

  try {
    const { data, error } = await supabase
      .from("artists")
      .select("id, name, slug, image_url")
      .ilike("name", name.trim())
      .limit(5);
    if (error || !Array.isArray(data) || !data.length) {
      catalogArtistCache.set(fold, { row: null, expiresAt: Date.now() + CATALOG_TTL_MS });
      return null;
    }
    // Confident exact fold match only — never auto-merge ambiguous.
    const exact = data.filter((row) => normalizeMatchText(row.name) === fold);
    if (exact.length !== 1) {
      catalogArtistCache.set(fold, { row: null, expiresAt: Date.now() + CATALOG_TTL_MS });
      return null;
    }
    const row = exact[0];
    catalogArtistCache.set(fold, { row, expiresAt: Date.now() + CATALOG_TTL_MS });
    return row;
  } catch {
    catalogArtistCache.set(fold, { row: null, expiresAt: Date.now() + 30_000 });
    return null;
  }
}

/**
 * Attach opaque/catalog artist (+ optional album) identities to a search hit.
 * Mutates nothing permanent in Supabase.
 */
export async function resolveHitIdentities(hit, options = {}) {
  const enrichment = hit?.enrichment || {};
  const rawArtist =
    enrichment.primaryArtist ||
    hit?.artist ||
    hit?.artist_name ||
    "";
  const parsed = parseArtistCredits(rawArtist);
  const primaryName = parsed.primaryArtist || "Unknown Artist";

  let catalog = null;
  if (options.lookupCatalog !== false) {
    catalog = await lookupCatalogArtistByName(primaryName);
  }

  const artwork =
    enrichment.albumArtworkUrl ||
    enrichment.mediaThumbnailUrl ||
    hit?.artwork ||
    null;

  const artistRow = entityStore.upsertArtist({
    name: catalog?.name || primaryName,
    artwork: catalog?.image_url || artwork,
    catalogArtistId: catalog?.id || null,
  });

  let albumRow = null;
  const albumTitle = enrichment.album || hit?.album || null;
  if (albumTitle && artistRow) {
    albumRow = entityStore.upsertAlbum({
      title: albumTitle,
      artistId: artistRow.id,
      artistName: artistRow.name,
      artwork,
      year: enrichment.releaseYear || null,
    });
  }

  return {
    artistId: artistRow?.id || null,
    artistName: artistRow?.name || primaryName,
    albumId: albumRow?.id || null,
    albumTitle: albumRow?.title || albumTitle || null,
    artists: parsed.artists,
  };
}

export function rememberTrackRelationships(record) {
  if (!record?.publicPlaybackId) return;
  if (record.artistId) entityStore.linkTrackToArtist(record.artistId, record.publicPlaybackId);
  if (record.albumId) entityStore.linkTrackToAlbum(record.albumId, record.publicPlaybackId);
}

import { supabase } from "./supabase.js";
import {
  isUuid,
  logApiWarning,
  logSupabaseError,
  sanitizeFilterToken,
} from "./apiDiagnostics.js";

function slugCandidates(rawValue) {
  const clean = sanitizeFilterToken(rawValue, 120).toLowerCase();
  if (!clean) return [];

  const parts = clean.split("-").filter(Boolean);
  const candidates = new Set([clean]);

  if (parts.length >= 2) {
    candidates.add(parts.slice(-2).join("-"));
  }

  if (parts.length >= 3) {
    candidates.add(parts.slice(-3).join("-"));
  }

  if (parts.length >= 1) {
    candidates.add(parts[parts.length - 1]);
  }

  return Array.from(candidates).filter(Boolean);
}

function humanizeSlug(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function lookupAlbumIdsByCandidates(candidates) {
  const found = new Set();

  for (const candidate of candidates) {
    const { data: slugRows, error: slugError } = await supabase
      .from("albums")
      .select("id, slug, title")
      .eq("slug", candidate)
      .limit(5);

    if (slugError) {
      logSupabaseError("album_resolver.slug", slugError, { candidate });
      continue;
    }

    (slugRows || []).forEach((row) => {
      if (row?.id) found.add(row.id);
    });

    const titleGuess = humanizeSlug(candidate);

    if (titleGuess) {
      const { data: titleRows, error: titleError } = await supabase
        .from("albums")
        .select("id, slug, title")
        .ilike("title", `%${titleGuess}%`)
        .limit(5);

      if (titleError) {
        logSupabaseError("album_resolver.title", titleError, { candidate, titleGuess });
        continue;
      }

      (titleRows || []).forEach((row) => {
        if (row?.id) found.add(row.id);
      });
    }
  }

  return Array.from(found);
}

export async function resolveAlbumFilter(albumIdRaw, route = "songs") {
  const albumId = sanitizeFilterToken(albumIdRaw, 120);

  if (!albumId) {
    return {
      albumIds: [],
      resolvedBy: null,
      textFallback: null,
    };
  }

  if (isUuid(albumId)) {
    return {
      albumIds: [albumId],
      resolvedBy: "uuid",
      textFallback: null,
    };
  }

  const candidates = slugCandidates(albumId);
  const resolvedIds = await lookupAlbumIdsByCandidates(candidates);

  if (resolvedIds.length > 0) {
    return {
      albumIds: resolvedIds,
      resolvedBy: "album_slug_lookup",
      textFallback: null,
    };
  }

  logApiWarning(route, {
    warning: "album_filter_unresolved",
    albumId,
    candidates,
  });

  return {
    albumIds: [],
    resolvedBy: "not_found",
    textFallback: humanizeSlug(albumId) || albumId,
  };
}

async function lookupArtistIdsByCandidates(candidates) {
  const found = new Set();

  for (const candidate of candidates) {
    const { data: slugRows, error: slugError } = await supabase
      .from("artists")
      .select("id, slug, name")
      .eq("slug", candidate)
      .limit(5);

    if (slugError) {
      logSupabaseError("artist_resolver.slug", slugError, { candidate });
      continue;
    }

    (slugRows || []).forEach((row) => {
      if (row?.id) found.add(row.id);
    });

    const nameGuess = humanizeSlug(candidate);

    if (nameGuess) {
      const { data: nameRows, error: nameError } = await supabase
        .from("artists")
        .select("id, slug, name")
        .ilike("name", `%${nameGuess}%`)
        .limit(5);

      if (nameError) {
        logSupabaseError("artist_resolver.name", nameError, { candidate, nameGuess });
        continue;
      }

      (nameRows || []).forEach((row) => {
        if (row?.id) found.add(row.id);
      });
    }
  }

  return Array.from(found);
}

export async function resolveArtistFilter(artistIdRaw, route = "songs") {
  const artistId = sanitizeFilterToken(artistIdRaw, 120);

  if (!artistId) {
    return {
      artistIds: [],
      resolvedBy: null,
      textFallback: null,
    };
  }

  if (isUuid(artistId)) {
    return {
      artistIds: [artistId],
      resolvedBy: "uuid",
      textFallback: null,
    };
  }

  const candidates = slugCandidates(artistId);
  const resolvedIds = await lookupArtistIdsByCandidates(candidates);

  if (resolvedIds.length > 0) {
    return {
      artistIds: resolvedIds,
      resolvedBy: "artist_slug_lookup",
      textFallback: null,
    };
  }

  logApiWarning(route, {
    warning: "artist_filter_unresolved",
    artistId,
    candidates,
  });

  return {
    artistIds: [],
    resolvedBy: "not_found",
    textFallback: humanizeSlug(artistId) || artistId,
  };
}

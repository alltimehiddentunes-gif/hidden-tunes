/**
 * Source-basic metadata provider.
 * Uses only fields already present on the search hit + derived safe defaults.
 * Does NOT call external fabricated metadata APIs.
 */

import { cleanPresentationTitle } from "./titleClean.js";
import { parseArtistCredits } from "./artistParse.js";

function youtubeMediaThumbnail(sourceId) {
  const id = String(sourceId || "").trim();
  if (!/^[a-zA-Z0-9_-]{6,32}$/.test(id)) return null;
  // Internal use only — never emit this host in public JSON.
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export const sourceBasicMetadataProvider = {
  id: "source-basic",
  capabilities: ["TRACK_METADATA", "ARTWORK"],

  async lookup(identity) {
    const titleInfo = cleanPresentationTitle(identity.title, identity.artist);
    const artistInfo = parseArtistCredits(identity.artist);
    const durationMs = Number.isFinite(Number(identity.durationMs)) ? Number(identity.durationMs) : null;

    let mediaThumbnailUrl = null;
    if (String(identity.provider || "").toLowerCase() === "youtube" && identity.sourceId) {
      mediaThumbnailUrl = youtubeMediaThumbnail(identity.sourceId);
    } else if (identity.mediaThumbnailUrl) {
      mediaThumbnailUrl = String(identity.mediaThumbnailUrl);
    }

    // Without a verified album metadata service, album remains unknown (not "Singles" lie).
    const album = identity.album ? String(identity.album) : null;

    const confidence =
      titleInfo.displayTitle && artistInfo.primaryArtist && artistInfo.primaryArtist !== "Unknown Artist"
        ? "HIGH"
        : titleInfo.displayTitle
          ? "PROBABLE"
          : "NO_MATCH";

    return {
      confidence,
      displayTitle: titleInfo.displayTitle,
      sourceTitle: titleInfo.sourceTitle,
      versionHints: titleInfo.versionHints,
      primaryArtist: artistInfo.primaryArtist,
      featuredArtists: artistInfo.featuredArtists,
      artists: artistInfo.artists,
      album,
      albumArtworkUrl: identity.albumArtworkUrl || null,
      mediaThumbnailUrl,
      durationMs,
      releaseYear: identity.releaseYear || null,
      genre: identity.genre || null,
      explicit: typeof identity.explicit === "boolean" ? identity.explicit : null,
      isrc: identity.isrc || null,
    };
  },
};

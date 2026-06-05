import { isHeavyPerfDiagnosticsEnabled } from "./devDiagnostics";

type Details = Record<string, string | number | boolean | undefined>;

function log(event: string, details: Details = {}) {
  if (typeof __DEV__ !== "undefined" && __DEV__ && isHeavyPerfDiagnosticsEnabled()) {
    console.log(event, { at: Date.now(), ...details });
  }
}

export function logAlbumTracksResolvedPrimary(details: Details = {}) {
  log("album_tracks_resolved_primary", details);
}

export function logAlbumTracksResolvedFallback(details: Details = {}) {
  log("album_tracks_resolved_fallback", details);
}

export function logAlbumArtworkResolvedFromTrack(details: Details = {}) {
  log("album_artwork_resolved_from_track", details);
}

export function logAlbumPlayContextReady(details: Details = {}) {
  log("album_play_context_ready", details);
}

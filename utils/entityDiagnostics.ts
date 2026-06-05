export type EntityDiagnosticKind =
  | "album"
  | "artist"
  | "genre"
  | "mood"
  | "station"
  | "playlist";

type EntityDiagnosticPayload = Record<string, unknown>;

function logEntityDiagnostic(event: string, payload: EntityDiagnosticPayload) {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log(event, payload);
  }
}

export function logEntityTapReceived(
  kind: EntityDiagnosticKind,
  payload: EntityDiagnosticPayload = {}
) {
  logEntityDiagnostic("entity_tap_received", { kind, ...payload });
}

export function logEntityResolveStart(
  kind: EntityDiagnosticKind,
  payload: EntityDiagnosticPayload = {}
) {
  logEntityDiagnostic("entity_resolve_start", { kind, ...payload });
}

export function logEntityResolveSuccess(
  kind: EntityDiagnosticKind,
  payload: EntityDiagnosticPayload = {}
) {
  logEntityDiagnostic("entity_resolve_success", { kind, ...payload });
}

export function logEntityResolveEmpty(
  kind: EntityDiagnosticKind,
  payload: EntityDiagnosticPayload = {}
) {
  logEntityDiagnostic("entity_resolve_empty", { kind, ...payload });
}

export function logEntityResolveFallbackUsed(
  kind: EntityDiagnosticKind,
  payload: EntityDiagnosticPayload = {}
) {
  logEntityDiagnostic("entity_resolve_fallback_used", { kind, ...payload });
}

export function logEntityTracksResolved(
  kind: EntityDiagnosticKind,
  payload: EntityDiagnosticPayload = {}
) {
  const event =
    kind === "album"
      ? "album_tracks_resolved"
      : kind === "artist"
        ? "artist_tracks_resolved"
        : kind === "genre"
          ? "genre_tracks_resolved"
          : kind === "mood"
            ? "room_tracks_resolved"
            : kind === "station"
              ? "station_tracks_resolved"
              : "playlist_tracks_resolved";

  logEntityDiagnostic(event, payload);
}

export function logEntityArtworkResolved(payload: EntityDiagnosticPayload = {}) {
  logEntityDiagnostic("entity_artwork_resolved", payload);
}
